import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOnboardingIntroduction } from "./onboarding-introduction";

vi.mock(import("../../../public/audio/chit/welcome/manifest.json"), () => ({
  default: [],
}));
describe("unavailable localized welcome", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("unlocks onboarding without substituting another language's audio", () => {
    const audio = vi.fn<() => HTMLAudioElement>();
    vi.stubGlobal("Audio", audio);
    const { result } = renderHook(() => useOnboardingIntroduction());
    act(() => {
      void result.current.playWelcome("Japanese");
    });
    expect(result.current.unavailable).toBeTruthy();
    expect(result.current.speaking).toBeFalsy();
    expect(audio).not.toHaveBeenCalled();
  });
});
