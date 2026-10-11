import type { OnboardingTurn } from "@chitchat/contracts/onboarding";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnboardingLive } from "@/lib/onboarding-live";

import { useOnboardingLive } from "./use-onboarding-live";

const attempts = vi.hoisted(
  () =>
    [] as {
      callbacks: ConstructorParameters<typeof OnboardingLive>[0];
      start: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
    }[]
);
vi.mock(import("@/lib/onboarding-live"), () => ({
  OnboardingLive: class {
    constructor(callbacks: ConstructorParameters<typeof OnboardingLive>[0]) {
      attempts.push({
        callbacks,
        start: this.start,
        close: this.close,
        pause: this.pause,
        resume: this.resume,
      });
    }
    start = vi.fn<OnboardingLive["start"]>().mockResolvedValue();
    close = vi.fn<() => void>();
    pause = vi.fn<() => void>();
    resume = vi.fn<() => void>();
    getInputVolume = vi.fn<() => number>().mockReturnValue(0.5);
    getAnalyser = vi.fn<OnboardingLive["getAnalyser"]>();
  } as unknown as typeof OnboardingLive,
}));
const ready: OnboardingTurn = {
  status: "ready",
  goal: "Speak clearly at work.",
  reply: "Let's practice clear work conversations.",
  suggestedSkills: ["clear-expression"],
};
function setup(autoStart = false) {
  const onMessages =
    vi.fn<Parameters<typeof useOnboardingLive>[0]["onMessages"]>();
  return {
    onMessages,
    ...renderHook(() =>
      useOnboardingLive({
        name: "Alex",
        language: "English",
        onMessages,
        onResolved:
          vi.fn<Parameters<typeof useOnboardingLive>[0]["onResolved"]>(),
        autoStart,
      })
    ),
  };
}
function latestAttempt() {
  const attempt = attempts.at(-1);
  if (!attempt) {
    throw new Error("No voice attempt was started.");
  }
  return attempt;
}

describe("onboarding voice hook", () => {
  beforeEach(() => {
    attempts.length = 0;
  });
  afterEach(cleanup);

  it("waits for explicit startup unless entering a newly chosen voice attempt", () => {
    const { result } = setup();
    expect(attempts).toHaveLength(0);
    expect(result.current.phase).toBe("idle");
    act(() => result.current.start());
    expect(latestAttempt().start).toHaveBeenCalledExactlyOnceWith({
      name: "Alex",
      language: "English",
    });
    expect(result.current.phase).toBe("connecting");
  });

  it("starts fresh on voice entry and persists only finalized transcript messages", () => {
    const { result, onMessages } = setup(true);
    const { callbacks } = latestAttempt();
    expect(onMessages).toHaveBeenCalledWith([]);
    const partial = [
      { id: 1, role: "user" as const, text: "I want", final: false },
    ];
    act(() => callbacks.onMessages(partial, []));
    expect(result.current.messages).toStrictEqual(partial);
    expect(onMessages).toHaveBeenLastCalledWith([]);
    const confirmed = [
      { role: "user" as const, text: "I want to speak clearly." },
    ];
    act(() =>
      callbacks.onMessages(
        [{ ...partial[0], text: confirmed[0].text, final: true }],
        confirmed
      )
    );
    expect(onMessages).toHaveBeenLastCalledWith(confirmed);
  });

  it("restarts with cleared state and rejects callbacks from the abandoned attempt", () => {
    const { result, onMessages } = setup(true);
    const previous = latestAttempt();
    act(() => {
      previous.callbacks.onMessages(
        [{ id: 1, role: "user", text: "Old goal", final: true }],
        [{ role: "user", text: "Old goal" }]
      );
      previous.callbacks.onError("Old failure");
    });
    act(() => result.current.start());
    expect(previous.close).toHaveBeenCalledOnce();
    expect({
      messages: result.current.messages,
      error: result.current.error,
    }).toStrictEqual({ messages: [], error: null });
    const count = onMessages.mock.calls.length;
    act(() => {
      previous.callbacks.onComplete(ready);
      previous.callbacks.onMessages(
        [{ id: 2, role: "assistant", text: "Late reply", final: true }],
        [{ role: "assistant", text: "Late reply" }]
      );
      previous.callbacks.onPhase("speaking");
      previous.callbacks.onError("Late error");
    });
    expect({
      phase: result.current.phase,
      result: result.current.result,
      messages: result.current.messages,
    }).toStrictEqual({ phase: "connecting", result: null, messages: [] });
    expect(onMessages).toHaveBeenCalledTimes(count);
  });

  it("pauses and resumes the same attempt when inspecting its transcript", () => {
    const { result } = setup(true);
    const live = latestAttempt();
    act(() => result.current.pause());
    act(() => result.current.resume());
    expect(live.pause).toHaveBeenCalledOnce();
    expect(live.resume).toHaveBeenCalledOnce();
    expect(attempts).toHaveLength(1);
    expect(live.close).not.toHaveBeenCalled();
  });

  it("stops immediately and ignores all later effects", () => {
    const { result, onMessages } = setup(true);
    const live = latestAttempt();
    act(() => result.current.stop());
    expect(live.close).toHaveBeenCalledOnce();
    act(() => live.callbacks.onComplete(ready));
    expect(result.current.result).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect({
      volume: result.current.getInputVolume(),
      analyser: result.current.getAnalyser(),
    }).toStrictEqual({ volume: 0, analyser: null });
    expect(onMessages).toHaveBeenCalledExactlyOnceWith([]);
  });

  it.each(["unmount", "pagehide"])(
    "disposes capture on %s without publishing stale results",
    (end) => {
      const { unmount, onMessages } = setup(true);
      const live = latestAttempt();
      if (end === "unmount") {
        unmount();
      } else {
        act(() => window.dispatchEvent(new Event("pagehide")));
      }
      expect(live.close).toHaveBeenCalledOnce();
      act(() =>
        live.callbacks.onMessages(
          [{ id: 1, role: "user", text: "Late", final: true }],
          [{ role: "user", text: "Late" }]
        )
      );
      expect(onMessages).toHaveBeenCalledExactlyOnceWith([]);
    }
  );
});
