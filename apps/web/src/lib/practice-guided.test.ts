// The two transport mocks expose callbacks to exercise late events deterministically.
/* eslint-disable max-classes-per-file, class-methods-use-this, promise/prefer-await-to-callbacks */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateGuidedTurn, speakPracticeTurn } from "./practice-api";
import type { PracticeAudio } from "./practice-audio";
import { PracticeGuided } from "./practice-guided";
import type { PracticeTranscription } from "./practice-transcription";

const speech = vi.hoisted(() => ({
  segments: [] as ConstructorParameters<typeof PracticeTranscription>[0][],
  drain: undefined as (() => void) | undefined,
  failure: undefined as ((message: string) => void) | undefined,
  input: undefined as Parameters<PracticeAudio["prepare"]>[1] | undefined,
  dispose: vi.fn<() => void>(),
  close: vi.fn<() => void>(),
}));
vi.mock(import("./practice-audio"), () => ({
  PracticeAudio: class {
    inputVolume = 0;
    prepare = async (
      _signal: AbortSignal,
      input: Parameters<PracticeAudio["prepare"]>[1],
      failure: Parameters<PracticeAudio["prepare"]>[2]
    ) => {
      speech.failure = failure;
      speech.input = input;
      await Promise.resolve();
    };
    setMuted = vi.fn<(value: boolean) => void>();
    stopPlayback = vi.fn<() => void>();
    play = vi.fn<() => void>();
    finishPlayback = vi.fn<() => void>();
    drainPlayback = (callback: () => void) => {
      speech.drain = callback;
    };
    dispose = speech.dispose;
  } as unknown as typeof PracticeAudio,
}));
vi.mock(import("./practice-transcription"), () => ({
  PracticeTranscription: class {
    constructor(
      callbacks: ConstructorParameters<typeof PracticeTranscription>[0]
    ) {
      speech.segments.push(callbacks);
    }
    start = async () => {
      await Promise.resolve();
    };
    close = speech.close;
    sendAudio = vi.fn<() => void>();
  } as unknown as typeof PracticeTranscription,
}));
vi.mock(import("./practice-api"), async (importOriginal) => ({
  ...(await importOriginal()),
  generateGuidedTurn: vi.fn<typeof generateGuidedTurn>(),
  speakPracticeTurn: vi.fn<typeof speakPracticeTurn>(),
  createTranscriptionSession: () =>
    Promise.resolve({ token: "auth_tokens/test" }),
}));
const selection = {
  personaId: "maya",
  placeId: "cafe",
  settingId: "networking",
  mode: "guided" as const,
};
const turn = { text: "What do you do after work?", reply: "I go for a walk" };
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}
async function setup() {
  const callbacks = {
    onState:
      vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onState"]>(),
    onProgress:
      vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onProgress"]>(),
    onMessage:
      vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onMessage"]>(),
    onTranscript:
      vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onTranscript"]>(),
    onError:
      vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onError"]>(),
  };
  const guided = new PracticeGuided(callbacks);
  await guided.start(selection);
  expect(speech.segments).toHaveLength(0);
  speech.drain?.();
  await flush();
  const recognition = speech.segments.at(-1);
  if (!recognition) {
    throw new Error("Recognition did not start.");
  }
  return { guided, callbacks, recognition };
}

describe("Guided turn lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    speech.segments = [];
    speech.drain = undefined;
    vi.mocked(generateGuidedTurn).mockResolvedValue(turn);
    vi.mocked(speakPracticeTurn).mockResolvedValue({
      text: turn.text,
      audio: "AAA=",
      mimeType: "audio/pcm;rate=24000",
    });
  });
  afterEach(() => vi.useRealTimers());

  it("waits for playback, finalized words, and quiet; submits once", async () => {
    const { guided, callbacks, recognition } = await setup();
    recognition.onSegment?.("1", turn.reply, false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    recognition.onSegment?.("1", "I go", false);
    expect(callbacks.onProgress.mock.lastCall?.[0].preview).toBe(2);
    recognition.onSegment?.("1", turn.reply, true);
    recognition.onSegment?.("1", turn.reply, true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(
      callbacks.onMessage.mock.calls.filter(
        ([message]) => message.speaker === "user"
      )
    ).toHaveLength(1);
    expect(generateGuidedTurn).toHaveBeenCalledTimes(2);
    guided.close();
  });

  it("keeps missing words open and accepts a later repair", async () => {
    const { guided, callbacks, recognition } = await setup();
    recognition.onSegment?.("1", "I go a walk", true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    recognition.onSegment?.("2", "for a walk", true);
    await vi.advanceTimersByTimeAsync(100);
    expect(callbacks.onMessage.mock.lastCall?.[0].speaker).toBe("user");
    guided.close();
  });

  it("ignores old recognition after retry and never invents speech for skip", async () => {
    const { guided, callbacks, recognition } = await setup();
    guided.retry();
    await flush();
    recognition.onSegment?.("old", turn.reply, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    guided.skip();
    await flush();
    expect(generateGuidedTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skipped: true,
        messages: [{ id: 0, speaker: "partner", text: turn.text }],
      }),
      expect.any(AbortSignal)
    );
    expect(
      callbacks.onProgress.mock.calls.some(
        ([progress]) => progress.skipped === 1
      )
    ).toBeTruthy();
    guided.close();
  });

  it("does not accept muted speech and releases resources on exit", async () => {
    const { guided, callbacks, recognition } = await setup();
    guided.setMuted(true);
    recognition.onSegment?.("1", turn.reply, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    guided.finish();
    recognition.onSegment?.("2", turn.reply, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    expect(speech.dispose).toHaveBeenCalledOnce();
    expect(callbacks.onState).toHaveBeenLastCalledWith("ended");
  });

  it("retries failed TTS without regenerating or duplicating the partner turn", async () => {
    vi.mocked(speakPracticeTurn).mockRejectedValueOnce(
      new Error("unavailable")
    );
    const callbacks = {
      onState:
        vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onState"]>(),
      onProgress:
        vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onProgress"]>(),
      onMessage:
        vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onMessage"]>(),
      onTranscript:
        vi.fn<
          ConstructorParameters<typeof PracticeGuided>[0]["onTranscript"]
        >(),
      onError:
        vi.fn<ConstructorParameters<typeof PracticeGuided>[0]["onError"]>(),
    };
    const guided = new PracticeGuided(callbacks);
    await guided.start(selection);
    expect(callbacks.onMessage).not.toHaveBeenCalled();
    guided.retry();
    await flush();
    expect(generateGuidedTurn).toHaveBeenCalledOnce();
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    guided.close();
  });

  it("ends and releases audio when the microphone fails", async () => {
    const { callbacks } = await setup();
    speech.failure?.("The microphone disconnected.");
    expect(callbacks.onState).toHaveBeenLastCalledWith("ended");
    expect(callbacks.onError).toHaveBeenLastCalledWith(
      "The microphone disconnected."
    );
    expect(speech.dispose).toHaveBeenCalledOnce();
  });
});
