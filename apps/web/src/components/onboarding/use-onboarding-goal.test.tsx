import type { OnboardingTurn } from "@chitchat/contracts/onboarding";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { replyToOnboarding } from "@/lib/practice-api";

import { useOnboardingGoal } from "./use-onboarding-goal";

vi.mock(import("@/lib/practice-api"), () => ({
  replyToOnboarding: vi.fn<typeof replyToOnboarding>(),
}));
const ready: OnboardingTurn = {
  status: "ready",
  reply: "Got it—you want to keep conversations going.",
  goal: "Keep conversations going with new people.",
  suggestedSkills: ["conversation-flow"],
};
const clarify: OnboardingTurn = {
  status: "clarify",
  reply: "When does talking feel hardest?",
  goal: "",
  suggestedSkills: [],
};
function setup() {
  const onReady = vi.fn<(turn: OnboardingTurn) => void>();
  const onReply = vi.fn<(messages: unknown) => void>();
  return {
    onReady,
    onReply,
    ...renderHook(() =>
      useOnboardingGoal({
        initialMessages: [],
        name: "Alex",
        language: "English",
        onReply,
        onReady,
      })
    ),
  };
}
describe("onboarding clarification turns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(replyToOnboarding).mockResolvedValue(ready);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows an acknowledgment before advancing without confirmation", async () => {
    const { result, onReady } = setup();
    await act(() => {
      void result.current.submit("Keep conversations going");
    });
    expect(result.current.messages.at(-1)?.text).toBe(ready.reply);
    expect(onReady).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("reading");
    await act(() => vi.advanceTimersByTimeAsync(1800));
    expect(onReady).toHaveBeenCalledExactlyOnceWith(ready);
  });

  it("includes both sides of a clarification in the next request", async () => {
    vi.mocked(replyToOnboarding).mockResolvedValueOnce(clarify);
    const { result, onReady } = setup();
    await act(() => {
      void result.current.submit("idk");
    });
    expect(result.current.phase).toBe("idle");
    expect(onReady).not.toHaveBeenCalled();
    await act(() => {
      void result.current.submit("Meeting new people");
    });
    expect(replyToOnboarding).toHaveBeenLastCalledWith(
      {
        name: "Alex",
        language: "English",
        messages: [
          { role: "user", text: "idk" },
          { role: "assistant", text: clarify.reply },
          { role: "user", text: "Meeting new people" },
        ],
      },
      expect.any(AbortSignal),
      expect.any(Function)
    );
    await act(() => vi.advanceTimersByTimeAsync(1800));
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("retries failed replies without duplicating the user's message", async () => {
    vi.mocked(replyToOnboarding).mockRejectedValueOnce(new Error("Offline"));
    const { result } = setup();
    await act(() => result.current.submit("Meet people"));
    expect(result.current.error).toBeTruthy();
    await act(() => {
      void result.current.submit("Meet people");
    });
    expect(
      vi.mocked(replyToOnboarding).mock.calls[1]?.[0].messages
    ).toHaveLength(1);
  });

  it("guards same-frame duplicate submissions and releases the guard on cancellation", async () => {
    const pending = Promise.withResolvers<OnboardingTurn>();
    vi.mocked(replyToOnboarding)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(clarify);
    const { result } = setup();
    act(() => {
      void result.current.submit("Meet people");
      void result.current.submit("Meet people");
    });
    expect(replyToOnboarding).toHaveBeenCalledOnce();
    act(() => result.current.stop());
    await act(() => result.current.submit("Meet coworkers"));
    expect(replyToOnboarding).toHaveBeenCalledTimes(2);
    await act(() => pending.resolve(ready));
    expect(result.current.messages.at(-1)?.text).toBe(clarify.reply);
  });

  it("cancels pending advancement when the user goes back", async () => {
    const { result, onReady } = setup();
    await act(() => {
      void result.current.submit("Meet people");
    });
    act(() => result.current.reset());
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(onReady).not.toHaveBeenCalled();
    expect(result.current.messages).toStrictEqual([]);
  });

  it("ignores a late model response after unmount", async () => {
    let finish: ((turn: OnboardingTurn) => void) | undefined;
    vi.mocked(replyToOnboarding).mockReturnValue(
      // oxlint-disable-next-line promise/avoid-new -- Simulate a pending network request.
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result, unmount, onReady, onReply } = setup();
    act(() => {
      void result.current.submit("Meet people");
    });
    unmount();
    await act(() => finish?.(ready));
    expect(onReady).not.toHaveBeenCalled();
    expect(onReply).not.toHaveBeenCalled();
  });

  it("shows incremental text without saving or advancing until final", async () => {
    let finish!: (turn: OnboardingTurn) => void;
    let partial!: (reply: string) => void;
    vi.mocked(replyToOnboarding).mockImplementation(
      (_body, _signal, onPartial) => {
        partial = onPartial;
        // oxlint-disable-next-line promise/avoid-new -- Hold the final turn while text arrives.
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
    );
    const { result, onReply, onReady } = setup();
    act(() => {
      void result.current.submit("Meet people");
    });
    act(() => partial("Got it"));
    expect({
      text: result.current.messages.at(-1)?.text,
      phase: result.current.phase,
      result: result.current.result,
    }).toStrictEqual({ text: "Got it", phase: "streaming", result: null });
    expect(onReply).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(onReady).not.toHaveBeenCalled();
    await act(() => finish(ready));
    expect(onReply).toHaveBeenCalledExactlyOnceWith(
      [
        { role: "user", text: "Meet people" },
        { role: "assistant", text: ready.reply },
      ],
      ready
    );
    await act(() => vi.advanceTimersByTimeAsync(1800));
    expect(onReady).toHaveBeenCalledExactlyOnceWith(ready);
  });

  it("rolls back failed partial text and keeps the user's answer for retry", async () => {
    vi.mocked(replyToOnboarding).mockImplementationOnce(
      (_body, _signal, partial) => {
        partial("Unfinished reply");
        return Promise.reject(new Error("Truncated"));
      }
    );
    const { result, onReply, onReady } = setup();
    await act(() => result.current.submit("Meet people"));
    expect(result.current.messages).toStrictEqual([
      { role: "user", text: "Meet people" },
    ]);
    expect(onReply).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    act(() => {
      void result.current.submit("Meet people");
    });
    expect(
      vi.mocked(replyToOnboarding).mock.calls[1]?.[0].messages
    ).toHaveLength(1);
  });

  it("replaces non-monotonic reply snapshots instead of appending them", async () => {
    let partial!: (reply: string) => void;
    const pending = Promise.withResolvers<OnboardingTurn>();
    vi.mocked(replyToOnboarding).mockImplementationOnce(
      (_body, _signal, onPartial) => {
        partial = onPartial;
        return pending.promise;
      }
    );
    const { result } = setup();
    act(() => {
      void result.current.submit("Meet people");
    });
    act(() => partial("An initial longer reply"));
    act(() => partial("Revised"));
    expect(result.current.messages).toStrictEqual([
      { role: "user", text: "Meet people" },
      { role: "assistant", text: "Revised" },
    ]);
    act(() => result.current.stop());
    await act(() => pending.resolve(ready));
    expect(result.current.result).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect(result.current.messages).toStrictEqual([]);
  });

  it("ignores stale partial and final output after reset and a new request", async () => {
    let finish!: (turn: OnboardingTurn) => void;
    let partial!: (reply: string) => void;
    vi.mocked(replyToOnboarding).mockImplementationOnce(
      (_body, _signal, onPartial) => {
        partial = onPartial;
        // oxlint-disable-next-line promise/avoid-new -- Simulate a transport ignoring abort.
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
    );
    const { result, onReply } = setup();
    act(() => {
      void result.current.submit("Old answer");
    });
    act(() => partial("Old partial"));
    act(() => result.current.reset());
    await act(() => {
      void result.current.submit("New answer");
    });
    act(() => partial("Stale partial"));
    await act(() => finish(clarify));
    expect(result.current.messages[0]?.text).toBe("New answer");
    expect(result.current.messages.at(-1)?.text).toBe(ready.reply);
    expect(onReply).toHaveBeenCalledOnce();
  });
});
