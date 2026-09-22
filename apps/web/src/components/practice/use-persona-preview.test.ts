import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePersonaPreview } from "./use-persona-preview";

const maya = {
  id: "maya",
  name: "Maya",
  voice: "Kore",
  gender: "Female" as const,
  pitch: "Middle" as const,
  tags: ["Bright"],
  description: "Bright",
  introduction: "Hi, I'm Maya!",
  introductionAudio: "/audio/personas/maya.mp3",
  avatar: "/images/personas/maya.svg",
};
const leo = {
  ...maya,
  id: "leo",
  name: "Leo",
  introductionAudio: "/audio/personas/leo.mp3",
  avatar: "/images/personas/leo.svg",
};
let clips: HTMLAudioElement[];

describe("saved persona introductions", () => {
  beforeEach(() => {
    clips = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.stubGlobal(
      "Audio",
      // Audio is called with `new`; an arrow mock is not constructible.
      // oxlint-disable-next-line prefer-arrow-callback
      vi.fn(function MockAudio(src: string) {
        const audio = document.createElement("audio");
        audio.src = src;
        clips.push(audio);
        return audio;
      })
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("plays the saved file and supports replay after it ends", async () => {
    const { result } = renderHook(() => usePersonaPreview());
    await act(() => result.current.play(maya));
    expect(clips[0]?.getAttribute("src")).toBe(maya.introductionAudio);
    expect(result.current.status).toBe("playing");
    act(() => clips[0]?.dispatchEvent(new Event("ended")));
    expect(result.current.status).toBeNull();
    await act(() => result.current.play(maya));
    expect(clips).toHaveLength(2);
    expect(result.current.status).toBe("playing");
  });

  it("releases the previous clip and ignores its late playback rejection", async () => {
    const pending = Promise.withResolvers<undefined>();
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(
      pending.promise
    );
    const { result } = renderHook(() => usePersonaPreview());
    act(() => {
      void result.current.play(maya);
    });
    await act(() => result.current.play(leo));
    expect(clips[0]?.hasAttribute("src")).toBeFalsy();
    expect(clips[0]?.pause).toHaveBeenCalledWith();
    await act(() => pending.reject(new Error("Interrupted")));
    expect(result.current.status).toBe("playing");
    expect(result.current.error).toBeNull();
  });

  it("reports unavailable audio and recovers on retry", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new Error("Missing file")
    );
    const { result } = renderHook(() => usePersonaPreview());
    await act(() => result.current.play(maya));
    expect(result.current.error).toContain("Couldn't play Maya");
    expect(result.current.status).toBeNull();
    await act(() => result.current.play(maya));
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("playing");
  });

  it("stops playback on request and releases audio on navigation", async () => {
    const { result, unmount } = renderHook(() => usePersonaPreview());
    await act(() => result.current.play(maya));
    act(() => result.current.stop());
    expect(clips[0]?.hasAttribute("src")).toBeFalsy();
    expect(result.current.status).toBeNull();
    await act(() => result.current.play(leo));
    unmount();
    expect(clips[1]?.hasAttribute("src")).toBeFalsy();
    expect(clips[1]?.onended).toBeNull();
  });
});
