// Audio and transcription doubles model separate resources.
/* oxlint-disable max-classes-per-file */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticeAudio } from "@/lib/practice-audio";
import type { PracticeTranscription } from "@/lib/practice-transcription";

import { useSetupSpeech } from "./use-setup-speech";

const mocks = vi.hoisted(() => ({
  token: vi.fn<(signal: AbortSignal) => Promise<{ token: string }>>(),
  audio: [] as {
    inputVolume: number;
    prepare: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    stopInput: ReturnType<typeof vi.fn>;
  }[],
  captions: [] as {
    callbacks: ConstructorParameters<typeof PracticeTranscription>[0];
    start: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    sendAudio: ReturnType<typeof vi.fn>;
    finish: ReturnType<typeof vi.fn>;
    done: () => void;
  }[],
  prepare: vi.fn<PracticeAudio["prepare"]>(),
}));
vi.mock(import("@/lib/practice-api"), () => ({
  createTranscriptionSession: mocks.token,
}));
vi.mock(import("@/lib/practice-audio"), () => ({
  PracticeAudio: class {
    inputVolume = 0;
    prepare = mocks.prepare;
    dispose = vi.fn<() => void>();
    stopInput = vi.fn<() => void>();
    constructor() {
      mocks.audio.push(this);
    }
  } as unknown as typeof PracticeAudio,
}));
vi.mock(import("@/lib/practice-transcription"), () => ({
  PracticeTranscription: class {
    start = vi.fn<PracticeTranscription["start"]>().mockResolvedValue();
    close = vi.fn<() => void>();
    sendAudio = vi.fn<PracticeTranscription["sendAudio"]>();
    completion = Promise.withResolvers<undefined>();
    done = () => this.completion.resolve();
    finish = vi.fn<PracticeTranscription["finish"]>(
      () => this.completion.promise
    );
    callbacks: ConstructorParameters<typeof PracticeTranscription>[0];
    constructor(
      callbacks: ConstructorParameters<typeof PracticeTranscription>[0]
    ) {
      this.callbacks = callbacks;
      mocks.captions.push(this);
    }
  } as unknown as typeof PracticeTranscription,
}));

describe("Gemini setup speech", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.audio.length = 0;
    mocks.captions.length = 0;
    mocks.token.mockReset().mockResolvedValue({ token: "auth_tokens/test" });
    mocks.prepare.mockReset().mockResolvedValue();
    vi.stubGlobal("AudioContext", vi.fn<() => void>());
    vi.stubGlobal("AudioWorkletNode", vi.fn<() => void>());
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn<() => void>() },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("connects with a temporary token, streams mic audio, and cleans up on unmount", async () => {
    const transcript = vi.fn<(text: string) => void>();
    const { result, unmount } = renderHook(() => useSetupSpeech(transcript));
    expect(mocks.token).not.toHaveBeenCalled();
    await act(() => result.current.start());
    expect(mocks.captions[0].start).toHaveBeenCalledWith(
      "auth_tokens/test",
      expect.any(AbortSignal)
    );
    expect(result.current.listening).toBeTruthy();
    const send = mocks.prepare.mock.calls[0][1] as (
      data: string,
      rate: number
    ) => void;
    send("pcm", 48_000);
    unmount();
    mocks.captions[0].callbacks.onText("1", "late");
    send("late pcm", 48_000);
    expect(mocks.captions[0].sendAudio).toHaveBeenCalledExactlyOnceWith(
      "pcm",
      48_000
    );
    expect({
      transcripts: transcript.mock.calls.length,
      disposed: mocks.audio[0].dispose.mock.calls.length,
      closed: mocks.captions[0].close.mock.calls.length,
    }).toStrictEqual({ transcripts: 0, disposed: 1, closed: 1 });
  });

  it("replaces interim segments, appends new segments, and waits for final text before submitting", async () => {
    const transcript = vi.fn<(text: string) => void>();
    const complete = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useSetupSpeech(transcript, {
        silenceTimeoutMs: 5000,
        onComplete: complete,
      })
    );
    await act(() => result.current.start());
    const [captions] = mocks.captions;
    act(() => {
      captions.callbacks.onText("1", "Make");
      captions.callbacks.onText("1", "Make friends.");
      captions.callbacks.onText("2", "And");
      vi.advanceTimersByTime(5000);
    });
    expect(mocks.audio[0].stopInput).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
    await act(() => {
      captions.callbacks.onText("2", "And travel.");
      captions.done();
    });
    expect(transcript).toHaveBeenLastCalledWith("Make friends. And travel.");
    expect(complete).toHaveBeenCalledOnce();
  });

  it("pauses without submitting and preserves words across a fresh connection", async () => {
    const transcript = vi.fn<(text: string) => void>();
    const complete = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useSetupSpeech(transcript, {
        silenceTimeoutMs: 5000,
        onComplete: complete,
      })
    );
    await act(() => result.current.start());
    act(() => mocks.captions[0].callbacks.onText("1", "Make friends"));
    act(() => result.current.pause());
    act(() => {
      mocks.captions[0].callbacks.onText("1", "late");
      vi.advanceTimersByTime(10_000);
    });
    expect(complete).not.toHaveBeenCalled();
    await act(() => result.current.start());
    act(() => mocks.captions[1].callbacks.onText("1", "and travel"));
    expect(transcript).toHaveBeenLastCalledWith("Make friends and travel");
    expect(mocks.token).toHaveBeenCalledTimes(2);
  });

  it("extends the silence window during sustained microphone activity", async () => {
    const { result } = renderHook(() =>
      useSetupSpeech(vi.fn<() => void>(), { silenceTimeoutMs: 5000 })
    );
    await act(() => result.current.start());
    act(() => {
      mocks.captions[0].callbacks.onText("1", "Hello");
      mocks.audio[0].inputVolume = 0.1;
      vi.advanceTimersByTime(7000);
    });
    expect(mocks.captions[0].finish).not.toHaveBeenCalled();
    act(() => {
      mocks.audio[0].inputVolume = 0;
      vi.advanceTimersByTime(5000);
    });
    expect(mocks.captions[0].finish).toHaveBeenCalledOnce();
  });

  it("releases resources and reports permission denial", async () => {
    mocks.prepare.mockRejectedValue(
      new DOMException("Denied", "NotAllowedError")
    );
    const { result } = renderHook(() => useSetupSpeech(vi.fn<() => void>()));
    await act(() => result.current.start());
    expect(result.current.error).toContain("Microphone access was denied");
    expect(result.current.listening).toBeFalsy();
    expect(mocks.audio[0].dispose).toHaveBeenCalledOnce();
  });

  it("ignores pending token completion after cancellation", async () => {
    const token = Promise.withResolvers<{ token: string }>();
    mocks.token.mockReturnValue(token.promise);
    const { result } = renderHook(() => useSetupSpeech(vi.fn<() => void>()));
    await act(() => result.current.start());
    act(() => result.current.cancel());
    await act(() => token.resolve({ token: "late-token" }));
    expect(mocks.captions[0].start).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("does not submit after a transcription disconnect during finalization", async () => {
    const complete = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useSetupSpeech(vi.fn<() => void>(), { onComplete: complete })
    );
    await act(() => result.current.start());
    act(() => mocks.captions[0].callbacks.onText("1", "Hello"));
    act(() => result.current.stop());
    await act(() => {
      mocks.captions[0].callbacks.onFailure();
      mocks.captions[0].done();
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result.current.error).toContain("couldn't connect");
  });
});
