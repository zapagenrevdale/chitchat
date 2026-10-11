import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingLocaleContext } from "@/lib/onboarding-locale";

import {
  OnboardingWelcome,
  useOnboardingIntroduction,
} from "./onboarding-introduction";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock(import("motion/react"), async (original) => ({
  ...(await original()),
  useReducedMotion: () => motion.reduced,
}));

describe("welcome playback lifecycle", () => {
  const clips: HTMLAudioElement[] = [];
  const frames: FrameRequestCallback[] = [];
  const events: EventListener[] = [];

  beforeEach(() => {
    motion.reduced = false;
    clips.length = 0;
    frames.length = 0;
    events.length = 0;
    function createAudio() {
      const clip = document.createElement("audio");
      const addEventListener = clip.addEventListener.bind(clip);
      vi.spyOn(clip, "addEventListener").mockImplementation(
        (type, listener, options) => {
          if (typeof listener === "function") {
            events.push(listener);
          }
          addEventListener(type, listener, options);
        }
      );
      // oxlint-disable-next-line unicorn/no-useless-undefined -- play resolves without a value.
      vi.spyOn(clip, "play").mockResolvedValue(undefined);
      vi.spyOn(clip, "pause").mockImplementation(() => {});
      clips.push(clip);
      return clip;
    }
    vi.stubGlobal("Audio", createAudio);
    vi.stubGlobal("AudioContext", () => {
      throw new Error("Web Audio unavailable");
    });
    vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) =>
      frames.push(tick)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn<typeof cancelAnimationFrame>());
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ignores queued frame, media and rejected play callbacks from a stopped clip", async () => {
    const pending = Promise.withResolvers<undefined>();
    const { result } = renderHook(() => useOnboardingIntroduction());
    // Keep the first play pending so its rejection can arrive during the next clip.
    const create = Audio;
    function pendingAudio() {
      const clip = new create();
      vi.spyOn(clip, "play").mockReturnValue(pending.promise);
      return clip;
    }
    vi.stubGlobal("Audio", pendingAudio);
    let oldPlay: Promise<void> | undefined;
    act(() => {
      oldPlay = result.current.playWelcome("English");
    });
    const oldEvents = [...events];
    const [oldFrame] = frames;
    const [old] = clips;
    act(() => result.current.stop());
    vi.stubGlobal("Audio", create);
    await act(() => result.current.playWelcome("English"));
    const scheduled = frames.length;
    old.currentTime = 10;
    await act(async () => {
      oldFrame(0);
      for (const callback of oldEvents) {
        callback.call(old, new Event("timeupdate"));
      }
      pending.reject(new Error("Late rejection"));
      await oldPlay;
    });
    expect(result.current.speaking).toBeTruthy();
    expect(result.current.unavailable).toBeFalsy();
    expect(result.current.revealedWords).toBe(0);
    expect(frames).toHaveLength(scheduled);
    act(() => {
      clips[1].currentTime = 0.3;
      clips[1].dispatchEvent(new Event("timeupdate"));
    });
    expect(result.current.revealedWords).toBe(1);
  });

  it("keeps the whole recorded welcome readable with reduced motion", () => {
    motion.reduced = true;
    render(
      <OnboardingLocaleContext value="en">
        <OnboardingWelcome speaking revealedWords={0} headingRef={null} />
      </OnboardingLocaleContext>
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAccessibleName(
      "Welcome! We'll practice everyday conversations to help you build fluency and confidence. Tell me, what made you want to start practicing?"
    );
    expect(
      [...heading.querySelectorAll("span")].every(
        (word) => word.style.opacity === "1"
      )
    ).toBeTruthy();
  });
});
