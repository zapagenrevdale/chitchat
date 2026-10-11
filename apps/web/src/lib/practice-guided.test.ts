// The two transport mocks expose callbacks to exercise late events deterministically.
/* eslint-disable max-classes-per-file, class-methods-use-this, promise/prefer-await-to-callbacks */
/* eslint-disable vitest/max-expects, no-await-in-loop */
import { guidedTurnRequestSchema, guidedTurnSchema } from "@chitchat/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateGuidedTurn, speakPracticeTurn } from "./practice-api";
import type { PracticeAudio } from "./practice-audio";
import { PracticeGuided } from "./practice-guided";
import type { PracticeMessage } from "./practice-live";
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

function recentExchanges(history: PracticeMessage[]) {
  const exchanges: PracticeMessage[][] = [];
  for (const message of history) {
    if (message.speaker === "partner") {
      exchanges.push([message]);
    } else {
      exchanges.at(-1)?.push(message);
    }
  }
  while (
    exchanges.flat().length > 300 ||
    exchanges.flat().reduce((sum, message) => sum + message.text.length, 0) >
      60_000
  ) {
    exchanges.shift();
  }
  return exchanges.flat();
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

  it.each([
    {
      name: "short completed exchanges",
      count: 160,
      long: false,
      mixed: false,
      skips: false,
    },
    {
      name: "maximum-length exchanges",
      count: 80,
      long: true,
      mixed: false,
      skips: false,
    },
    {
      name: "skipped exchanges",
      count: 310,
      long: false,
      mixed: false,
      skips: true,
    },
    {
      name: "mixed exchanges",
      count: 320,
      long: true,
      mixed: true,
      skips: false,
    },
    {
      name: "non-BMP exchanges",
      count: 80,
      long: true,
      mixed: false,
      skips: false,
      unicode: true,
    },
  ])(
    "keeps a whole recent suffix for $name and preserves the full recap",
    async ({ count, long, mixed, skips, unicode }) => {
      const response = guidedTurnSchema.parse(
        long
          ? { text: (unicode ? "😀" : "p").repeat(600), reply: "r".repeat(240) }
          : turn
      );
      vi.mocked(generateGuidedTurn).mockResolvedValue(response);
      const { guided, callbacks } = await setup();
      let completed = 0;
      let skipped = 0;
      for (let index = 0; index < count; index += 1) {
        const shouldSkip = skips || (mixed && index % 3 === 0);
        if (shouldSkip) {
          guided.skip();
          skipped += 1;
          await flush();
        } else {
          speech.segments.at(-1)?.onSegment?.(`${index}`, response.reply, true);
          completed += 1;
          await vi.advanceTimersByTimeAsync(1200);
        }
        const request = vi.mocked(generateGuidedTurn).mock.lastCall?.[0];
        expect(request).toBeDefined();
        expect(guidedTurnRequestSchema.safeParse(request).success).toBeTruthy();
        const history = callbacks.onMessage.mock.calls
          .map(([message]) => message)
          .slice(0, -1);
        expect(request?.messages).toStrictEqual(recentExchanges(history));
        expect(request?.skipped).toBe(shouldSkip);
        speech.drain?.();
        await flush();
      }
      const messages = callbacks.onMessage.mock.calls.map(
        ([message]) => message
      );
      expect(messages.map(({ id }) => id)).toStrictEqual(
        Array.from({ length: completed * 2 + skipped + 1 }, (_, index) => index)
      );
      expect(callbacks.onProgress.mock.lastCall?.[0]).toMatchObject({
        completed,
        skipped,
        phase: "listening",
      });
      expect(
        callbacks.onError.mock.calls.filter(([error]) => error)
      ).toStrictEqual([]);
      const beforeRetry = callbacks.onMessage.mock.calls.length;
      vi.mocked(generateGuidedTurn).mockRejectedValueOnce(
        new Error("unavailable")
      );
      guided.skip();
      await flush();
      const failedRequest = vi.mocked(generateGuidedTurn).mock.lastCall?.[0];
      expect(
        guidedTurnRequestSchema.safeParse(failedRequest).success
      ).toBeTruthy();
      expect(callbacks.onProgress.mock.lastCall?.[0].phase).toBe("error");
      expect(callbacks.onMessage).toHaveBeenCalledTimes(beforeRetry);
      vi.mocked(speakPracticeTurn).mockRejectedValueOnce(
        new Error("unavailable")
      );
      guided.retry();
      await flush();
      expect(vi.mocked(generateGuidedTurn).mock.lastCall?.[0]).toStrictEqual(
        failedRequest
      );
      expect(callbacks.onMessage).toHaveBeenCalledTimes(beforeRetry);
      const generations = vi.mocked(generateGuidedTurn).mock.calls.length;
      guided.retry();
      await flush();
      expect(generateGuidedTurn).toHaveBeenCalledTimes(generations);
      expect(callbacks.onMessage).toHaveBeenCalledTimes(beforeRetry + 1);
      expect(callbacks.onMessage.mock.lastCall?.[0].id).toBe(beforeRetry);
      speech.drain?.();
      await flush();
      expect(callbacks.onProgress.mock.lastCall?.[0]).toMatchObject({
        completed,
        skipped: skipped + 1,
        phase: "listening",
      });
      guided.finish();
      expect(callbacks.onState).toHaveBeenLastCalledWith("ended");
    }
  );
});

const message = (id: number, text: string) => ({
  id,
  speaker: "partner" as const,
  text,
});

describe("guided transcript contract boundaries", () => {
  it("accepts 300 messages and rejects one extra", () => {
    const messages = Array.from({ length: 300 }, (_, index) =>
      message(index, "p")
    );
    expect(
      guidedTurnRequestSchema.safeParse({ selection, messages }).success
    ).toBeTruthy();
    expect(
      guidedTurnRequestSchema.safeParse({
        selection,
        messages: [...messages, message(300, "p")],
      }).success
    ).toBeFalsy();
  });

  it("counts characters per message and UTF-16 units in aggregate", () => {
    const text = "😀".repeat(8000);
    expect(
      guidedTurnRequestSchema.safeParse({
        selection,
        messages: [message(0, text)],
      }).success
    ).toBeTruthy();
    expect(
      guidedTurnRequestSchema.safeParse({
        selection,
        messages: [message(0, `${text}x`)],
      }).success
    ).toBeFalsy();
    const messages = Array.from({ length: 8 }, (_, index) =>
      message(index, "😀".repeat(index === 7 ? 2000 : 4000))
    );
    expect(
      guidedTurnRequestSchema.safeParse({ selection, messages }).success
    ).toBeTruthy();
    expect(
      guidedTurnRequestSchema.safeParse({
        selection,
        messages: [...messages, message(8, "x")],
      }).success
    ).toBeFalsy();
  });
});
