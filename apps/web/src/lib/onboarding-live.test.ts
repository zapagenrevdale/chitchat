// The audio and socket doubles belong to one voice lifecycle fixture.
/* oxlint-disable max-classes-per-file */
import type { OnboardingLiveSession } from "@chitchat/contracts/onboarding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingLive } from "./onboarding-live";
import type * as ApiModule from "./practice-api";
import {
  completeOnboardingVoice,
  createOnboardingSession,
  PracticeApiError,
} from "./practice-api";
import type * as AudioModule from "./practice-audio";

const audio = vi.hoisted(() => ({
  onPlaying: undefined as ((playing: boolean) => void) | undefined,
  onProgress: undefined as
    | ((position: AudioModule.PlaybackPosition) => void)
    | undefined,
  position: {
    generation: 0,
    consumedSamples: 0,
    submittedSamples: 0,
    sampleRate: 24_000,
  },
  prepare: vi.fn<AudioModule.PracticeAudio["prepare"]>(),
  play: vi.fn<AudioModule.PracticeAudio["play"]>(),
  dispose: vi.fn<() => void>(),
  stopPlayback: vi.fn<() => void>(),
  finishPlayback: vi.fn<() => void>(),
  drainPlayback: vi.fn<(done: () => void) => void>(),
  setMuted: vi.fn<(muted: boolean) => void>(),
  getAnalyser: vi.fn<AudioModule.PracticeAudio["getAnalyser"]>(),
  getPlaybackPosition:
    vi.fn<AudioModule.PracticeAudio["getPlaybackPosition"]>(),
  inputVolume: 0.3,
}));
vi.mock(import("./practice-audio"), () => ({
  PracticeAudio: class {
    constructor(
      onPlaying: (playing: boolean) => void,
      onProgress?: (position: AudioModule.PlaybackPosition) => void
    ) {
      audio.onPlaying = onPlaying;
      audio.onProgress = onProgress;
    }
    getPlaybackPosition = audio.getPlaybackPosition;
    prepare = audio.prepare;
    play = audio.play;
    dispose = audio.dispose;
    stopPlayback = audio.stopPlayback;
    finishPlayback = audio.finishPlayback;
    drainPlayback = audio.drainPlayback;
    setMuted = audio.setMuted;
    getAnalyser = audio.getAnalyser;
    inputVolume = audio.inputVolume;
  } as unknown as typeof AudioModule.PracticeAudio,
}));
vi.mock(import("./practice-api"), async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    completeOnboardingVoice: vi.fn<typeof actual.completeOnboardingVoice>(),
    createOnboardingSession: vi.fn<typeof actual.createOnboardingSession>(),
  };
});

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Test fixture was not initialized.");
  }
  return value;
}
class FakeSocket extends EventTarget {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "blob";
  sent: object[] = [];
  closed = false;
  readonly url: string;
  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as object);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  message(data: object) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) })
    );
  }
  disconnect() {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close"));
  }
}

const learner = { name: "Alex", language: "English" as const };
const outcome = {
  status: "ready" as const,
  goal: "Speak clearly in work meetings.",
  suggestedSkills: ["clear-expression" as const],
};
const completionCall = {
  id: "goal-1",
  name: "complete_onboarding",
  args: { status: outcome.status, goal: outcome.goal },
};
const audioPart = {
  inlineData: { data: "audio", mimeType: "audio/pcm;rate=24000" },
};
const session: OnboardingLiveSession = {
  token: "auth_tokens/onboarding",
  model: "gemini-3.8-live",
  apiVersion: "v1beta",
  expiresAt: Date.now() + 180_000,
  maxDurationMs: 180_000,
};
let attempts: OnboardingLive[] = [];
function setup() {
  const callbacks = {
    onPhase:
      vi.fn<ConstructorParameters<typeof OnboardingLive>[0]["onPhase"]>(),
    onMessages:
      vi.fn<ConstructorParameters<typeof OnboardingLive>[0]["onMessages"]>(),
    onComplete:
      vi.fn<ConstructorParameters<typeof OnboardingLive>[0]["onComplete"]>(),
    onError:
      vi.fn<ConstructorParameters<typeof OnboardingLive>[0]["onError"]>(),
  };
  const live = new OnboardingLive(callbacks);
  attempts.push(live);
  return { live, callbacks };
}
async function connect() {
  const result = setup();
  await result.live.start(learner);
  const socket = required(FakeSocket.instances.at(-1));
  socket.open();
  socket.message({ setupComplete: {} });
  return { ...result, socket };
}
function answer(socket: FakeSocket) {
  socket.message({
    serverContent: {
      inputTranscription: { text: "I want to speak clearly in work meetings." },
    },
  });
}
function complete(socket: FakeSocket) {
  socket.message({ toolCall: { functionCalls: [completionCall] } });
}
function acknowledgment(socket: FakeSocket) {
  socket.message({
    serverContent: {
      outputTranscription: {
        text: "We can practice clear work conversations.",
      },
      modelTurn: { parts: [audioPart] },
      generationComplete: true,
      turnComplete: true,
    },
  });
}
function progress(consumedSamples: number) {
  audio.position.consumedSamples = consumedSamples;
  audio.onProgress?.({ ...audio.position });
}

function drain() {
  progress(audio.position.submittedSamples);
  audio.onPlaying?.(false);
  required(audio.drainPlayback.mock.calls.at(-1)?.[0])();
}

describe("native Gemini onboarding voice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.stubGlobal("WebSocket", FakeSocket);
    FakeSocket.instances = [];
    attempts = [];
    audio.prepare.mockResolvedValue();
    audio.getPlaybackPosition.mockImplementation(() => {
      const position = { ...audio.position };
      return position;
    });
    audio.position = {
      generation: 0,
      consumedSamples: 0,
      submittedSamples: 0,
      sampleRate: 24_000,
    };
    audio.play.mockImplementation(() => {
      audio.position.submittedSamples += 24_000;
    });
    audio.stopPlayback.mockImplementation(() => {
      audio.position = {
        ...audio.position,
        generation: audio.position.generation + 1,
        consumedSamples: 0,
        submittedSamples: 0,
      };
    });
    vi.mocked(createOnboardingSession).mockResolvedValue({
      ...session,
      expiresAt: Date.now() + 180_000,
    });
    vi.mocked(completeOnboardingVoice).mockResolvedValue(outcome);
  });
  afterEach(() => {
    for (const attempt of attempts) {
      attempt.close();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a fresh constrained v1beta session and asks its native opening question", async () => {
    const { socket, callbacks } = await connect();
    expect(createOnboardingSession).toHaveBeenCalledExactlyOnceWith(
      learner,
      expect.any(AbortSignal)
    );
    expect(socket.url).toContain(
      "v1beta.GenerativeService.BidiGenerateContentConstrained"
    );
    expect(socket.sent[0]).toStrictEqual({
      setup: { model: "models/gemini-3.8-live" },
    });
    expect(socket.sent[1]).toMatchObject({
      realtimeInput: { text: expect.stringContaining("one short question") },
    });
    expect({
      phase: callbacks.onPhase.mock.calls.at(-1)?.[0],
      messages: callbacks.onMessages.mock.calls,
    }).toStrictEqual({ phase: "thinking", messages: [] });
  });

  it("replaces interim hypotheses under a stable ID and persists only the authoritative segment", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: { interimInputTranscription: { text: "I want to" } },
    });
    socket.message({
      serverContent: { interimInputTranscription: { text: "I want to speak" } },
    });
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "user", text: "I want to speak", final: false }],
      []
    );
    answer(socket);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [
        {
          id: 1,
          role: "user",
          text: "I want to speak clearly in work meetings.",
          final: true,
        },
      ],
      [{ role: "user", text: "I want to speak clearly in work meetings." }]
    );
  });

  it("holds assistant captions and speaking state until audio actually starts", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "What would you like to practice?" },
      },
    });
    expect({
      captions: callbacks.onMessages.mock.calls.at(-1),
      phase: callbacks.onPhase.mock.calls.at(-1)?.[0],
    }).toStrictEqual({ captions: [[], []], phase: "thinking" });
    socket.message({ serverContent: { modelTurn: { parts: [audioPart] } } });
    expect(audio.play).toHaveBeenCalledExactlyOnceWith(
      "audio",
      "audio/pcm;rate=24000"
    );
    audio.onPlaying?.(true);
    progress(12_000);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "assistant", text: "What", final: false }],
      []
    );
    expect(callbacks.onPhase).toHaveBeenLastCalledWith("speaking");
    socket.message({
      serverContent: { generationComplete: true, turnComplete: true },
    });
    drain();
    expect(callbacks.onMessages.mock.calls.at(-1)?.[1]).toStrictEqual([
      { role: "assistant", text: "What would you like to practice?" },
    ]);
  });

  it("paces late untimed deltas without a jump and releases the remainder at drain", async () => {
    const { socket, callbacks } = await connect();
    socket.message({ serverContent: { modelTurn: { parts: [audioPart] } } });
    audio.onPlaying?.(true);
    progress(12_000);
    socket.message({
      serverContent: { outputTranscription: { text: "Hello " } },
    });
    socket.message({
      serverContent: {
        outputTranscription: { text: "Alex." },
        generationComplete: true,
      },
    });
    expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
    socket.message({
      serverContent: {
        outputTranscription: { text: " Welcome." },
        turnComplete: true,
      },
    });
    drain();
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "assistant", text: "Hello Alex. Welcome.", final: true }],
      [{ role: "assistant", text: "Hello Alex. Welcome." }]
    );
  });

  it("paces a streamed untimed response with PCM, freezes during underflow, and adapts at generation completion", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "one two three four five six seven eight",
        },
        modelTurn: { parts: [audioPart] },
      },
    });
    progress(12_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toStrictEqual([
      { id: 1, role: "assistant", text: "one", final: false },
    ]);
    vi.advanceTimersByTime(5000);
    progress(12_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0][0]?.text).toBe("one");
    socket.message({
      serverContent: { modelTurn: { parts: [audioPart, audioPart] } },
    });
    progress(24_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0][0]?.text).toBe(
      "one two"
    );
    socket.message({ serverContent: { generationComplete: true } });
    const afterGeneration =
      callbacks.onMessages.mock.calls.at(-1)?.[0][0]?.text;
    progress(48_000);
    expect({
      afterGeneration,
      later: callbacks.onMessages.mock.calls.at(-1)?.[0][0]?.text,
    }).toStrictEqual({
      afterGeneration: "one two",
      later: "one two three four five",
    });
    socket.message({ serverContent: { turnComplete: true } });
    drain();
    expect(callbacks.onMessages.mock.calls.at(-1)?.[1]).toStrictEqual([
      { role: "assistant", text: "one two three four five six seven eight" },
    ]);
  });

  it("paces the remaining pre-tool captions over actual PCM without completion markers", async () => {
    const { socket, callbacks } = await connect();
    answer(socket);
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "one two three four five six seven eight",
        },
        modelTurn: { parts: [audioPart, audioPart, audioPart, audioPart] },
      },
    });
    progress(24_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0][1]).toMatchObject({
      text: "one two",
      final: false,
    });
    complete(socket);
    expect({
      finishes: audio.finishPlayback.mock.calls.length,
      text: callbacks.onMessages.mock.calls.at(-1)?.[0][1]?.text,
    }).toStrictEqual({ finishes: 1, text: "one two" });
    progress(48_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0][1]).toMatchObject({
      text: "one two three four",
      final: false,
    });
    progress(96_000);
    expect({
      caption: callbacks.onMessages.mock.calls.at(-1)?.[0][1],
      confirmed: callbacks.onMessages.mock.calls.at(-1)?.[1],
    }).toMatchObject({
      caption: {
        text: "one two three four five six seven eight",
        final: false,
      },
      confirmed: [
        { role: "user", text: "I want to speak clearly in work meetings." },
      ],
    });
    drain();
    expect({
      confirmed: callbacks.onMessages.mock.calls.at(-1)?.[1],
      completions: callbacks.onComplete.mock.calls.length,
    }).toStrictEqual({
      confirmed: [
        { role: "user", text: "I want to speak clearly in work meetings." },
        { role: "assistant", text: "one two three four five six seven eight" },
      ],
      completions: 0,
    });
  });

  it("defers tool-ended queued playback and captions until activation", async () => {
    const { socket, callbacks } = await connect();
    answer(socket);
    socket.message({
      serverContent: {
        outputTranscription: { text: "First reply." },
        modelTurn: { parts: [audioPart] },
        turnComplete: true,
      },
    });
    socket.message({
      serverContent: {
        outputTranscription: { text: "one two three four" },
        modelTurn: { parts: [audioPart, audioPart, audioPart, audioPart] },
      },
      toolCall: { functionCalls: [completionCall] },
    });
    expect({
      plays: audio.play.mock.calls.length,
      finishes: audio.finishPlayback.mock.calls.length,
      drains: audio.drainPlayback.mock.calls.length,
      captions: callbacks.onMessages.mock.calls.at(-1)?.[0].length,
    }).toStrictEqual({ plays: 1, finishes: 1, drains: 1, captions: 1 });
    drain();
    expect({
      plays: audio.play.mock.calls.length,
      finishes: audio.finishPlayback.mock.calls.length,
      drains: audio.drainPlayback.mock.calls.length,
    }).toStrictEqual({ plays: 5, finishes: 2, drains: 2 });
    progress(36_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toHaveLength(2);
    progress(48_000);
    const firstCaption = callbacks.onMessages.mock.calls.at(-1)?.[0][2];
    progress(72_000);
    expect({
      firstCaption,
      laterCaption: callbacks.onMessages.mock.calls.at(-1)?.[0][2],
      confirmed: callbacks.onMessages.mock.calls.at(-1)?.[1].length,
    }).toMatchObject({
      firstCaption: { text: "one", final: false },
      laterCaption: { text: "one two", final: false },
      confirmed: 2,
    });
    drain();
    expect(callbacks.onMessages.mock.calls.at(-1)?.[1][2]).toStrictEqual({
      role: "assistant",
      text: "one two three four",
    });
  });

  it("uses each queued untimed turn's complete audio duration and playback origin", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "First reply." },
        modelTurn: { parts: [audioPart] },
        turnComplete: true,
      },
    });
    socket.message({
      serverContent: {
        outputTranscription: { text: "one two three four" },
        modelTurn: { parts: [audioPart, audioPart, audioPart, audioPart] },
        generationComplete: true,
      },
    });
    drain();
    expect(audio.finishPlayback).toHaveBeenCalledTimes(2);
    progress(36_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toHaveLength(1);
    progress(48_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toMatchObject([
      { text: "First reply.", final: true },
      { text: "one", final: false },
    ]);
    progress(72_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0][1]?.text).toBe(
      "one two"
    );
    socket.message({ serverContent: { turnComplete: true } });
    drain();
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0][1]).toMatchObject({
      text: "one two three four",
      final: true,
    });
  });

  it("cancels an approximate suffix on interruption and ignores its late drain", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "one two three four" },
        modelTurn: { parts: [audioPart, audioPart, audioPart, audioPart] },
        turnComplete: true,
      },
    });
    progress(24_000);
    const oldPosition = { ...audio.position, consumedSamples: 96_000 };
    const oldDrain = required(audio.drainPlayback.mock.calls.at(-1)?.[0]);
    socket.message({ serverContent: { interrupted: true } });
    oldDrain();
    audio.onProgress?.(oldPosition);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "assistant", text: "one", final: false }],
      []
    );
  });

  it("processes captions and all audio parts in the same event", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "Hello!" },
        modelTurn: { parts: [audioPart, audioPart] },
        generationComplete: true,
      },
    });
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.finishPlayback).toHaveBeenCalledOnce();
    expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
    audio.onPlaying?.(true);
    progress(24_000);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
    socket.message({ serverContent: { turnComplete: true } });
    drain();
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toMatchObject([
      { text: "Hello!", final: true },
    ]);
  });

  it("keeps the next response hidden until the preceding audio drains and its own playback starts", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "First reply.",
          words: [
            { text: "First reply.", startOffset: "0s", endOffset: "0.5s" },
          ],
        },
        modelTurn: { parts: [audioPart] },
        turnComplete: true,
      },
    });
    audio.onPlaying?.(true);
    progress(12_000);
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "Second reply.",
          words: [
            { text: "Second reply.", startOffset: "0s", endOffset: "0.5s" },
          ],
        },
        modelTurn: { parts: [audioPart] },
        turnComplete: true,
      },
    });
    expect(audio.play).toHaveBeenCalledOnce();
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toHaveLength(1);
    drain();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toHaveLength(1);
    audio.onPlaying?.(true);
    progress(36_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toMatchObject([
      { text: "First reply." },
      { text: "Second reply." },
    ]);
  });

  it("preserves exact cues then paces the untimed suffix, confirming only at drain", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "Hello, Alex. Let's practice.",
          words: [
            { word: "Hello", startOffset: "0s", endOffset: "0.2s" },
            { word: "Alex.", startOffset: "0.2s", endOffset: "0.5s" },
          ],
          finished: true,
        },
        modelTurn: { parts: [audioPart] },
        generationComplete: true,
      },
    });
    progress(4799);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
    progress(4800);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "assistant", text: "Hello", final: false }],
      []
    );
    progress(12_000);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "assistant", text: "Hello, Alex.", final: false }],
      []
    );
    progress(18_000);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0][0]?.text).toBe(
      "Hello, Alex. Let's"
    );
    socket.message({ serverContent: { turnComplete: true } });
    drain();
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [
        {
          id: 1,
          role: "assistant",
          text: "Hello, Alex. Let's practice.",
          final: true,
        },
      ],
      [{ role: "assistant", text: "Hello, Alex. Let's practice." }]
    );
  });

  it("catches up late timestamps in the current turn after generationComplete", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        modelTurn: { parts: [audioPart] },
        generationComplete: true,
      },
    });
    progress(12_000);
    socket.message({
      serverContent: { outputTranscription: { text: "Hello " } },
    });
    expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "Alex.",
          words: [
            { text: "Hello", startOffset: "0s", endOffset: "0.2s" },
            { text: "Alex.", startOffset: "0.2s", endOffset: "0.8s" },
          ],
        },
      },
    });
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "assistant", text: "Hello", final: false }],
      []
    );
    progress(19_200);
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toStrictEqual([
      { id: 1, role: "assistant", text: "Hello Alex.", final: false },
    ]);
  });

  it.each([undefined, "invalid", "-1s", "0.1"])(
    "paces missing or malformed timing %s and confirms only at successful drain",
    async (endOffset) => {
      const { socket, callbacks } = await connect();
      socket.message({
        serverContent: {
          outputTranscription: {
            text: "Hello.",
            words: [{ word: "Hello.", startOffset: "0s", endOffset }],
          },
          modelTurn: { parts: [audioPart] },
          turnComplete: true,
        },
      });
      progress(12_000);
      expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
      progress(24_000);
      expect(callbacks.onMessages).toHaveBeenLastCalledWith(
        [{ id: 1, role: "assistant", text: "Hello.", final: false }],
        []
      );
      drain();
      expect(callbacks.onMessages).toHaveBeenLastCalledWith(
        [{ id: 1, role: "assistant", text: "Hello.", final: true }],
        [{ role: "assistant", text: "Hello." }]
      );
    }
  );

  it("does not treat a timed text-only turn as spoken after earlier audio drains", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "Spoken." },
        modelTurn: { parts: [audioPart] },
        turnComplete: true,
      },
    });
    drain();
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "Not spoken.",
          words: [{ word: "Not spoken.", startOffset: "0s", endOffset: "0s" }],
        },
        turnComplete: true,
      },
    });
    drain();
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 1, role: "assistant", text: "Spoken.", final: true }],
      [{ role: "assistant", text: "Spoken." }]
    );
  });

  it.each(["interrupt", "error"])(
    "retains only the heard prefix on %s, not queued text",
    async (cause) => {
      const { socket, callbacks } = await connect();
      socket.message({
        serverContent: {
          outputTranscription: {
            text: "Heard. Unheard.",
            words: [
              { text: "Heard.", startOffset: "0s", endOffset: "0.25s" },
              { text: "Unheard.", startOffset: "0.25s", endOffset: "1s" },
            ],
          },
          modelTurn: { parts: [audioPart] },
          turnComplete: true,
        },
      });
      progress(6000);
      const oldPosition = { ...audio.position, consumedSamples: 24_000 };
      const oldDrain = required(audio.drainPlayback.mock.calls.at(-1)?.[0]);
      socket.message({
        serverContent: {
          outputTranscription: { text: "Queued." },
          modelTurn: { parts: [audioPart] },
          turnComplete: true,
        },
      });
      if (cause === "interrupt") {
        socket.message({ serverContent: { interrupted: true } });
      } else {
        required(audio.prepare.mock.calls[0]?.[2])("Playback stopped.");
      }
      oldDrain();
      audio.onProgress?.(oldPosition);
      expect(callbacks.onMessages).toHaveBeenLastCalledWith(
        [{ id: 1, role: "assistant", text: "Heard.", final: false }],
        []
      );
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    }
  );

  it("ignores old-generation progress after the next response starts", async () => {
    const { socket, callbacks } = await connect();
    socket.message({ serverContent: { modelTurn: { parts: [audioPart] } } });
    const oldPosition = { ...audio.position, consumedSamples: 24_000 };
    socket.message({ serverContent: { interrupted: true } });
    socket.message({
      serverContent: {
        outputTranscription: {
          text: "New.",
          words: [{ text: "New.", startOffset: "0s", endOffset: "0.25s" }],
        },
        modelTurn: { parts: [audioPart] },
      },
    });
    audio.onProgress?.(oldPosition);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
    progress(6000);
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [{ id: 2, role: "assistant", text: "New.", final: false }],
      []
    );
  });

  it("reports a queued audio error from the playback callback without an unhandled exception", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: { modelTurn: { parts: [audioPart] }, turnComplete: true },
    });
    socket.message({
      serverContent: { modelTurn: { parts: [audioPart] }, turnComplete: true },
    });
    audio.play.mockImplementationOnce(() => {
      throw new Error("Bad audio");
    });
    expect(() => drain()).not.toThrow();
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't play")
    );
  });

  it("waits for validated outcome, post-tool acknowledgment, and actual playback drain", async () => {
    const pending = Promise.withResolvers<typeof outcome>();
    vi.mocked(completeOnboardingVoice).mockReturnValueOnce(pending.promise);
    const { socket, callbacks } = await connect();
    answer(socket);
    complete(socket);
    expect(socket.sent.at(-1)).toMatchObject({
      toolResponse: {
        functionResponses: [
          { id: "goal-1", response: { accepted: true, provisional: true } },
        ],
      },
    });
    expect(completeOnboardingVoice).toHaveBeenCalledExactlyOnceWith(
      {
        ...learner,
        outcome: { status: outcome.status, goal: outcome.goal },
        messages: [
          { role: "user", text: "I want to speak clearly in work meetings." },
        ],
      },
      expect.any(AbortSignal)
    );
    socket.message({ serverContent: { turnComplete: true } });
    expect(audio.drainPlayback).not.toHaveBeenCalled();
    acknowledgment(socket);
    audio.onPlaying?.(true);
    drain();
    expect({
      completed: callbacks.onComplete.mock.calls.length,
      phase: callbacks.onPhase.mock.calls.at(-1)?.[0],
    }).toStrictEqual({ completed: 0, phase: "thinking" });
    pending.resolve(outcome);
    await Promise.resolve();
    expect(callbacks.onComplete).toHaveBeenCalledExactlyOnceWith({
      ...outcome,
      reply: "We can practice clear work conversations.",
    });
  });

  it("does not complete from a backend result or a silent acknowledgment alone", async () => {
    const { socket, callbacks } = await connect();
    answer(socket);
    complete(socket);
    await Promise.resolve();
    socket.message({
      serverContent: {
        outputTranscription: { text: "Let's practice." },
        generationComplete: true,
        turnComplete: true,
      },
    });
    drain();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(callbacks.onMessages).toHaveBeenLastCalledWith(
      [
        {
          id: 1,
          role: "user",
          text: "I want to speak clearly in work meetings.",
          final: true,
        },
      ],
      [{ role: "user", text: "I want to speak clearly in work meetings." }]
    );
    await vi.advanceTimersByTimeAsync(25_000);
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't finish")
    );
  });

  it("keeps a pending learner utterance open across turnComplete until its late authoritative segment", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: { interimInputTranscription: { text: "work meet" } },
    });
    complete(socket);
    acknowledgment(socket);
    audio.onPlaying?.(true);
    drain();
    expect(completeOnboardingVoice).not.toHaveBeenCalled();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    answer(socket);
    await Promise.resolve();
    expect(completeOnboardingVoice).toHaveBeenCalledOnce();
    expect(
      vi.mocked(completeOnboardingVoice).mock.calls[0]?.[0].messages[0]
    ).toStrictEqual({
      role: "user",
      text: "I want to speak clearly in work meetings.",
    });
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
  });

  it("waits for delayed learner evidence when a ready tool arrives before any transcript", async () => {
    const { socket, callbacks } = await connect();
    complete(socket);
    acknowledgment(socket);
    audio.onPlaying?.(true);
    drain();
    expect(completeOnboardingVoice).not.toHaveBeenCalled();
    answer(socket);
    await Promise.resolve();
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
  });

  it("allows an intentional choose outcome with no inferred goal", async () => {
    const choose = { status: "choose" as const, goal: "", suggestedSkills: [] };
    vi.mocked(completeOnboardingVoice).mockResolvedValueOnce(choose);
    const { socket, callbacks } = await connect();
    socket.message({
      toolCall: {
        functionCalls: [
          {
            ...completionCall,
            args: { status: choose.status, goal: choose.goal },
          },
        ],
      },
    });
    acknowledgment(socket);
    audio.onPlaying?.(true);
    drain();
    await Promise.resolve();
    expect(callbacks.onComplete).toHaveBeenCalledWith(
      expect.objectContaining(choose)
    );
  });

  it("treats duplicate tool calls idempotently and rejects invalid arguments", async () => {
    const { socket, callbacks } = await connect();
    answer(socket);
    socket.message({
      toolCall: {
        functionCalls: [
          { ...completionCall, id: "bad", args: { ...outcome, goal: "" } },
        ],
      },
    });
    expect(completeOnboardingVoice).not.toHaveBeenCalled();
    expect(socket.sent.at(-1)).toMatchObject({
      toolResponse: {
        functionResponses: [{ response: { error: expect.any(String) } }],
      },
    });
    complete(socket);
    complete(socket);
    expect(completeOnboardingVoice).toHaveBeenCalledOnce();
    acknowledgment(socket);
    audio.onPlaying?.(true);
    drain();
    await Promise.resolve();
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
  });

  it.each(["cancel", "interrupt", "correction"])(
    "invalidates provisional completion and late callbacks after %s",
    async (cause) => {
      const pending = Promise.withResolvers<typeof outcome>();
      vi.mocked(completeOnboardingVoice).mockReturnValueOnce(pending.promise);
      const { socket, callbacks } = await connect();
      answer(socket);
      complete(socket);
      acknowledgment(socket);
      audio.onPlaying?.(true);
      const oldDrain = required(audio.drainPlayback.mock.calls.at(-1)?.[0]);
      const signal = required(
        vi.mocked(completeOnboardingVoice).mock.calls[0]?.[1]
      );
      if (cause === "cancel") {
        socket.message({ toolCallCancellation: { ids: ["goal-1"] } });
      } else if (cause === "interrupt") {
        socket.message({
          serverContent: { interrupted: true, turnComplete: true },
        });
      } else {
        socket.message({
          serverContent: {
            interimInputTranscription: { text: "Actually, I meant" },
          },
        });
      }
      expect(signal.aborted).toBeTruthy();
      pending.resolve(outcome);
      oldDrain();
      await Promise.resolve();
      expect(callbacks.onComplete).not.toHaveBeenCalled();
      expect(audio.stopPlayback).toHaveBeenCalledWith();
      complete(socket);
      expect(completeOnboardingVoice).toHaveBeenCalledOnce();
    }
  );

  it("pauses microphone input while keeping the same voice transcript and socket", async () => {
    const { live, socket, callbacks } = await connect();
    answer(socket);
    const capture = required(audio.prepare.mock.calls[0]?.[1]);
    capture("before", 48_000);
    live.pause();
    const sent = socket.sent.length;
    capture("paused", 48_000);
    expect({
      count: socket.sent.length,
      last: socket.sent.at(-1),
      volume: live.getInputVolume(),
    }).toStrictEqual({
      count: sent,
      last: { realtimeInput: { audioStreamEnd: true } },
      volume: 0,
    });
    live.resume();
    capture("after", 48_000);
    expect(socket.sent.at(-1)).toStrictEqual({
      realtimeInput: {
        audio: { data: "after", mimeType: "audio/pcm;rate=48000" },
      },
    });
    expect(audio.setMuted).toHaveBeenLastCalledWith(false);
    expect(createOnboardingSession).toHaveBeenCalledOnce();
    expect(callbacks.onMessages.mock.calls.at(-1)?.[0]).toHaveLength(1);
  });

  it("does not expose unheard transcript on playback error", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "Here is the spoken reply." },
        generationComplete: true,
      },
    });
    const failure = required(audio.prepare.mock.calls[0]?.[2]);
    failure("Speech playback stopped. Please start again.");
    expect(callbacks.onMessages).toHaveBeenLastCalledWith([], []);
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("playback stopped")
    );
    expect(callbacks.onPhase).not.toHaveBeenCalledWith("speaking");
  });

  it("bounds transcript evidence without silently truncating an answer", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: { inputTranscription: { text: "x".repeat(501) } },
    });
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("too long")
    );
    expect(completeOnboardingVoice).not.toHaveBeenCalled();
    expect(socket.closed).toBeTruthy();
  });

  it("stops after 24 messages rather than dropping earlier evidence", async () => {
    const { socket, callbacks } = await connect();
    for (let index = 0; index < 24; index += 1) {
      socket.message({
        serverContent: { inputTranscription: { text: `Sentence ${index}` } },
      });
    }
    expect(callbacks.onMessages.mock.calls.at(-1)?.[1]).toHaveLength(24);
    socket.message({
      serverContent: { inputTranscription: { text: "Extra sentence" } },
    });
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("limit")
    );
  });

  it("enforces three minutes even while speech keeps arriving", async () => {
    const { socket, callbacks } = await connect();
    for (let index = 0; index < 5; index += 1) {
      vi.advanceTimersByTime(30_000);
      socket.message({
        serverContent: { inputTranscription: { text: "Still here." } },
      });
    }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("three-minute")
    );
    expect(socket.closed).toBeTruthy();
  });

  it.each([429, 503])(
    "offers text recovery when voice setup returns %s",
    async (status) => {
      vi.mocked(createOnboardingSession).mockRejectedValueOnce(
        new PracticeApiError("Voice is unavailable", status)
      );
      const { live, callbacks } = setup();
      await live.start(learner);
      expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(
        "Voice is unavailable",
        "text"
      );
      expect(audio.dispose).toHaveBeenCalledOnce();
      expect(FakeSocket.instances).toHaveLength(0);
    }
  );

  it("closes setup immediately and ignores a late microphone grant or token", async () => {
    const pending = Promise.withResolvers<OnboardingLiveSession>();
    vi.mocked(createOnboardingSession).mockReturnValueOnce(pending.promise);
    const { live, callbacks } = setup();
    const starting = live.start(learner);
    await Promise.resolve();
    live.close();
    pending.resolve(session);
    await starting;
    expect(FakeSocket.instances).toHaveLength(0);
    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards a microphone grant that arrives after teardown before requesting a token", async () => {
    const permission = Promise.withResolvers<undefined>();
    audio.prepare.mockReturnValueOnce(permission.promise);
    const { live, callbacks } = setup();
    const starting = live.start(learner);
    live.close();
    permission.resolve();
    await starting;
    expect(createOnboardingSession).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("ignores stale socket, audio, and backend events after teardown", async () => {
    const pending = Promise.withResolvers<typeof outcome>();
    vi.mocked(completeOnboardingVoice).mockReturnValueOnce(pending.promise);
    const { live, socket, callbacks } = await connect();
    answer(socket);
    complete(socket);
    acknowledgment(socket);
    const oldDrain = required(audio.drainPlayback.mock.calls.at(-1)?.[0]);
    live.close();
    const messages = callbacks.onMessages.mock.calls.length;
    socket.message({
      serverContent: {
        outputTranscription: { text: "Stale" },
        modelTurn: { parts: [audioPart] },
      },
    });
    audio.onPlaying?.(true);
    oldDrain();
    pending.resolve(outcome);
    await Promise.resolve();
    expect(callbacks.onMessages).toHaveBeenCalledTimes(messages);
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["setup", "socket", "buffer"])(
    "reports %s failure and disposes the microphone",
    async (failure) => {
      const { live, callbacks } = setup();
      await live.start(learner);
      const socket = required(FakeSocket.instances[0]);
      if (failure === "setup") {
        await vi.advanceTimersByTimeAsync(20_000);
      } else if (failure === "socket") {
        socket.disconnect();
      } else {
        socket.open();
        socket.message({ setupComplete: {} });
        socket.bufferedAmount = 300_000;
        required(audio.prepare.mock.calls[0]?.[1])("pcm", 48_000);
      }
      expect(callbacks.onError).toHaveBeenCalledOnce();
      expect(audio.dispose).toHaveBeenCalledOnce();
      expect(socket.closed).toBeTruthy();
    }
  );

  it("reports unavailable microphones and finalization failures without claiming readiness", async () => {
    audio.prepare.mockRejectedValueOnce(
      new DOMException("No device", "NotFoundError")
    );
    const first = setup();
    await first.live.start(learner);
    expect(first.callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("No microphone")
    );
    expect(createOnboardingSession).not.toHaveBeenCalled();
    const second = await connect();
    vi.mocked(completeOnboardingVoice).mockRejectedValueOnce(
      new Error("Offline")
    );
    answer(second.socket);
    complete(second.socket);
    await Promise.resolve();
    expect(second.callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't finish your goal")
    );
    expect(second.callbacks.onComplete).not.toHaveBeenCalled();
  });
});
