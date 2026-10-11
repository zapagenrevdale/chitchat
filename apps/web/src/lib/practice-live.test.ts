// Audio and WebSocket test doubles belong to the same lifecycle fixture.
/* oxlint-disable max-classes-per-file */
import type { CustomPlaceSummary, PracticeSession } from "@chitchat/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "./practice-api";
import {
  finalizePracticeFeedback,
  speakPracticeFeedback,
  createCustomPlaceSession,
  createCustomSituationSession,
  createPracticeSession,
  suggestPracticeReply,
  PracticeApiError,
} from "./practice-api";
import type * as AudioModule from "./practice-audio";
import { PracticeLive } from "./practice-live";
import type { PracticeSuggestion } from "./practice-live";
import type * as TranscriptionModule from "./practice-transcription";

const captions = vi.hoisted(() => ({
  callbacks: [] as ConstructorParameters<
    typeof TranscriptionModule.PracticeTranscription
  >[0][],
  start: vi
    .fn<TranscriptionModule.PracticeTranscription["start"]>()
    .mockResolvedValue(),
  finish: vi
    .fn<TranscriptionModule.PracticeTranscription["finish"]>()
    .mockResolvedValue(),
  close: vi.fn<() => void>(),
  sendAudio: vi.fn<(data: string, rate: number) => void>(),
  endAudio: vi.fn<() => void>(),
}));
vi.mock(import("./practice-transcription"), () => ({
  PracticeTranscription: class {
    constructor(
      callbacks: ConstructorParameters<
        typeof TranscriptionModule.PracticeTranscription
      >[0]
    ) {
      captions.callbacks.push(callbacks);
    }
    start = captions.start;
    finish = captions.finish;
    close = captions.close;
    sendAudio = captions.sendAudio;
    endAudio = captions.endAudio;
  } as unknown as typeof TranscriptionModule.PracticeTranscription,
}));

const audio = vi.hoisted(() => ({
  onPlaying: undefined as ((playing: boolean) => void) | undefined,
  inputVolume: 0,
  prepare: vi.fn<AudioModule.PracticeAudio["prepare"]>().mockResolvedValue(),
  play: vi.fn<AudioModule.PracticeAudio["play"]>(),
  dispose: vi.fn<() => void>(),
  stopPlayback: vi.fn<() => void>(),
  finishPlayback: vi.fn<() => void>(),
  drainPlayback: vi.fn<(done: () => void) => void>(),
  setMuted: vi.fn<(muted: boolean) => void>(),
  stopInput: vi.fn<() => void>(),
}));
vi.mock(import("./practice-audio"), () => ({
  PracticeAudio: class {
    constructor(onPlaying: (playing: boolean) => void) {
      audio.onPlaying = onPlaying;
    }
    private audioState = audio;
    get inputVolume() {
      return this.audioState.inputVolume;
    }
    prepare = audio.prepare;
    play = audio.play;
    dispose = audio.dispose;
    stopPlayback = audio.stopPlayback;
    finishPlayback = audio.finishPlayback;
    drainPlayback = audio.drainPlayback;
    setMuted = audio.setMuted;
    stopInput = audio.stopInput;
  } as unknown as typeof AudioModule.PracticeAudio,
}));
vi.mock(import("./practice-api"), async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    suggestPracticeReply: vi.fn<typeof actual.suggestPracticeReply>(),
    finalizePracticeFeedback: vi.fn<typeof actual.finalizePracticeFeedback>(),
    speakPracticeFeedback: vi.fn<typeof actual.speakPracticeFeedback>(),
    createPracticeSession: vi.fn<typeof actual.createPracticeSession>(),
    createCustomPlaceSession: vi.fn<typeof actual.createCustomPlaceSession>(),
    createCustomSituationSession:
      vi.fn<typeof actual.createCustomSituationSession>(),
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
  constructor(url: string) {
    super();
    this.url = url;
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
  disconnect(code = 1006) {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close", { code }));
  }
}
const selection = {
  personaId: "maya",
  placeId: "cafe",
  settingId: "networking",
};
let connections: PracticeLive[] = [];
function setup() {
  const callbacks = {
    onState: vi.fn<() => void>(),
    onSuggestion: vi.fn<(suggestion: PracticeSuggestion | null) => void>(),
    onFeedback: vi.fn<() => void>(),
    onFeedbackError: vi.fn<() => void>(),
    onTranscript: vi.fn<() => void>(),
    onMessage: vi.fn<() => void>(),
    onError: vi.fn<() => void>(),
    onCaptionWarning: vi.fn<() => void>(),
    onPlaceSummary: vi.fn<(place: CustomPlaceSummary) => void>(),
    onSituationSummary: vi.fn<(situation: CustomPlaceSummary) => void>(),
  };
  const live = new PracticeLive(callbacks);
  connections.push(live);
  return { live, callbacks };
}
async function connect() {
  const result = setup();
  await result.live.start(selection);
  const socket = required(FakeSocket.instances.at(-1));
  socket.open();
  socket.message({ setupComplete: {} });
  return { ...result, socket };
}
describe("continuous voice transport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    FakeSocket.instances = [];
    connections = [];
    captions.start.mockResolvedValue();
    captions.finish.mockResolvedValue();
    vi.stubGlobal("WebSocket", FakeSocket);
    audio.prepare.mockResolvedValue();
    audio.inputVolume = 0;
    vi.mocked(suggestPracticeReply)
      .mockReset()
      .mockResolvedValue({ text: "I enjoy meeting new people." });
    vi.mocked(speakPracticeFeedback).mockReset().mockResolvedValue({
      text: "Try a few more turns next time.",
      audio: "recap",
      mimeType: "audio/pcm;rate=24000",
    });
    vi.mocked(finalizePracticeFeedback)
      .mockReset()
      .mockResolvedValue({ status: "insufficient" });
    vi.mocked(createPracticeSession).mockResolvedValue({
      token: "auth_tokens/temporary",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 9e5,
    });
    vi.mocked(createCustomPlaceSession).mockResolvedValue({
      token: "auth_tokens/chit",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 9e5,
    });
    vi.mocked(createCustomSituationSession).mockResolvedValue({
      token: "auth_tokens/situation",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 9e5,
    });
  });
  afterEach(() => {
    for (const live of connections) {
      live.close();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("only suggests after a partner turn while listening", async () => {
    const { live, socket } = await connect();
    await live.suggestReply();
    expect(suggestPracticeReply).not.toHaveBeenCalled();
    socket.message({
      serverContent: {
        outputTranscription: { text: "What do you enjoy?" },
        turnComplete: true,
      },
    });
    required(audio.onPlaying)(true);
    await live.suggestReply();
    expect(suggestPracticeReply).not.toHaveBeenCalled();
    required(audio.onPlaying)(false);
    await live.suggestReply();
    expect(suggestPracticeReply).toHaveBeenCalledOnce();
  });

  it("attributes displayed help to the following learner turn in recap, without submitting it", async () => {
    const { live, socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "What do you enjoy?" },
        turnComplete: true,
      },
    });
    const sent = [...socket.sent];
    await live.suggestReply();
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith({
      text: "I enjoy meeting new people.",
      pending: false,
      error: null,
    });
    expect({
      messages: callbacks.onMessage.mock.calls.length,
      sent: socket.sent,
    }).toStrictEqual({ messages: 1, sent });
    socket.message({
      serverContent: { inputTranscription: { text: "Meeting people." } },
    });
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith({
      text: "I enjoy meeting new people.",
      pending: false,
      error: null,
    });
    socket.message({
      serverContent: {
        outputTranscription: { text: "Where do you meet them?" },
        turnComplete: true,
      },
    });
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith(null);
    socket.message({
      serverContent: {
        inputTranscription: { text: "At work." },
        turnComplete: true,
      },
    });
    live.finish();
    await vi.advanceTimersByTimeAsync(3000);
    expect(finalizePracticeFeedback).toHaveBeenCalledWith(
      {
        selection,
        tracingToken: undefined,
        messages: [
          { id: 1, speaker: "partner", text: "What do you enjoy?" },
          {
            id: 2,
            speaker: "user",
            text: "Meeting people.",
            suggestionShown: true,
          },
          { id: 3, speaker: "partner", text: "Where do you meet them?" },
          { id: 4, speaker: "user", text: "At work." },
        ],
      },
      expect.any(AbortSignal)
    );
  });

  it("rejects late help when the learner starts and leaves recap unassisted", async () => {
    const { live, socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "How are you?" },
        turnComplete: true,
      },
    });
    const pending = Promise.withResolvers<{ text: string }>();
    vi.mocked(suggestPracticeReply).mockReturnValueOnce(pending.promise);
    const request = live.suggestReply();
    const signal = required(vi.mocked(suggestPracticeReply).mock.calls[0]?.[1]);
    socket.message({
      serverContent: {
        inputTranscription: { text: "I'm well." },
        turnComplete: true,
      },
    });
    expect(signal.aborted).toBeTruthy();
    pending.resolve({ text: "Stale help" });
    await request;
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith({
      text: "",
      pending: false,
      error: null,
    });
    live.finish();
    await vi.advanceTimersByTimeAsync(3000);
    expect(finalizePracticeFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { id: 1, speaker: "partner", text: "How are you?" },
          { id: 2, speaker: "user", text: "I'm well." },
        ],
      }),
      expect.any(AbortSignal)
    );
  });

  it("preserves visible help when a pending refresh becomes stale", async () => {
    const { live, socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "What do you enjoy?" },
        turnComplete: true,
      },
    });
    await live.suggestReply();
    const pending = Promise.withResolvers<{ text: string }>();
    vi.mocked(suggestPracticeReply).mockReturnValueOnce(pending.promise);
    const request = live.suggestReply();
    expect(suggestPracticeReply).toHaveBeenLastCalledWith(
      expect.objectContaining({ previous: "I enjoy meeting new people." }),
      expect.any(AbortSignal)
    );
    socket.message({
      serverContent: { inputTranscription: { text: "I enjoy" } },
    });
    pending.resolve({ text: "Late refresh" });
    await request;
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith({
      text: "I enjoy meeting new people.",
      pending: false,
      error: null,
    });
  });

  it.each([
    "dismiss",
    "partner",
    "playback",
    "reconnect",
    "finish",
    "close",
  ] as const)(
    "cancels pending help on %s and ignores a late result",
    async (action) => {
      const { live, socket, callbacks } = await connect();
      socket.message({
        sessionResumptionUpdate: { resumable: true, newHandle: "checkpoint" },
        serverContent: {
          outputTranscription: { text: "How are you?" },
          turnComplete: true,
        },
      });
      const pending = Promise.withResolvers<{ text: string }>();
      vi.mocked(suggestPracticeReply).mockReturnValueOnce(pending.promise);
      const request = live.suggestReply();
      const signal = required(
        vi.mocked(suggestPracticeReply).mock.calls[0]?.[1]
      );
      switch (action) {
        case "dismiss": {
          live.dismissSuggestion();
          break;
        }
        case "partner": {
          socket.message({
            serverContent: { outputTranscription: { text: "Tell me more." } },
          });
          break;
        }
        case "playback": {
          required(audio.onPlaying)(true);
          break;
        }
        case "reconnect": {
          socket.disconnect();
          break;
        }
        case "finish": {
          live.finish();
          break;
        }
        default: {
          live.close();
          break;
        }
      }
      expect(signal.aborted).toBeTruthy();
      pending.resolve({ text: "Late help" });
      await request;
      expect(callbacks.onSuggestion).toHaveBeenLastCalledWith(null);
    }
  );

  it("ignores an older refresh without clearing the current pending request", async () => {
    const { live, socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "How are you?" },
        turnComplete: true,
      },
    });
    const older = Promise.withResolvers<{ text: string }>();
    const newer = Promise.withResolvers<{ text: string }>();
    vi.mocked(suggestPracticeReply)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const first = live.suggestReply();
    const second = live.suggestReply();
    older.resolve({ text: "Old help" });
    await first;
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith({
      text: "",
      pending: true,
      error: null,
    });
    newer.resolve({ text: "Current help" });
    await second;
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith({
      text: "Current help",
      pending: false,
      error: null,
    });
  });

  it("reports quota errors without interrupting the conversation", async () => {
    const { live, socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        outputTranscription: { text: "How are you?" },
        turnComplete: true,
      },
    });
    vi.mocked(suggestPracticeReply).mockRejectedValueOnce(
      new PracticeApiError("Try suggestions later.", 429)
    );
    await live.suggestReply();
    expect(callbacks.onSuggestion).toHaveBeenLastCalledWith({
      text: "",
      pending: false,
      error: "Try suggestions later.",
    });
    expect(callbacks.onState).toHaveBeenLastCalledWith("listening");
    expect(socket.closed).toBeFalsy();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("uses independent captions, preserves order, and reviews final text", async () => {
    vi.mocked(createPracticeSession).mockResolvedValue({
      token: "auth_tokens/test",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 900_000,
      transcriptionToken: "auth_tokens/captions",
    });
    const { live, socket, callbacks } = await connect();
    const captionCallbacks = required(captions.callbacks.at(-1));
    captionCallbacks.onTurn("first");
    captionCallbacks.onText("first", "I go too");
    socket.message({
      serverContent: {
        inputTranscription: { text: "wrong Gemini caption" },
        outputTranscription: { text: "Where?" },
        turnComplete: true,
      },
    });
    captionCallbacks.onTurn("second");
    captionCallbacks.onText("second", "The cafe.");
    captionCallbacks.onText("first", "I go to");
    expect(callbacks.onTranscript).toHaveBeenLastCalledWith({
      user: "The cafe.",
      partner: "Where?",
    });
    expect(JSON.stringify(callbacks.onMessage.mock.calls)).not.toContain(
      "wrong Gemini caption"
    );
    const drain = Promise.withResolvers<undefined>();
    captions.finish.mockReturnValue(drain.promise);
    live.finish();
    expect(JSON.stringify(socket.sent)).not.toContain("PRACTICE_FINISHED");
    captionCallbacks.onText("second", "The quiet cafe.");
    drain.resolve();
    await vi.advanceTimersByTimeAsync(3000);
    expect(finalizePracticeFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { id: 1, speaker: "user", text: "I go to" },
          { id: 2, speaker: "partner", text: "Where?" },
          { id: 3, speaker: "user", text: "The quiet cafe." },
        ],
      }),
      expect.any(AbortSignal)
    );
    live.close();
  });

  it("fans out identical PCM and stops caption audio while muted", async () => {
    vi.mocked(createPracticeSession).mockResolvedValue({
      token: "auth_tokens/test",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 900_000,
      transcriptionToken: "auth_tokens/captions",
    });
    const { live, socket } = await connect();
    const [, onAudio] = required(audio.prepare.mock.calls[0]);
    onAudio("same-pcm", 48_000);

    expect(socket.sent.at(-1)).toStrictEqual({
      realtimeInput: {
        audio: { data: "same-pcm", mimeType: "audio/pcm;rate=48000" },
      },
    });
    live.setMuted(true);
    onAudio("muted", 48_000);
    expect(captions.endAudio).toHaveBeenCalledOnce();
    expect(captions.sendAudio).toHaveBeenCalledExactlyOnceWith(
      "same-pcm",
      48_000
    );
    live.setMuted(false);
    onAudio("resumed", 48_000);
    expect(captions.sendAudio).toHaveBeenLastCalledWith("resumed", 48_000);
  });

  it("continues Gemini audio and captions if independent captions fail", async () => {
    vi.mocked(createPracticeSession).mockResolvedValue({
      token: "auth_tokens/test",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 900_000,
      transcriptionToken: "auth_tokens/captions",
    });
    const { socket, callbacks } = await connect();
    required(captions.callbacks.at(-1)).onFailure();
    socket.message({
      serverContent: { inputTranscription: { text: "Still talking." } },
    });
    expect(callbacks.onTranscript).toHaveBeenLastCalledWith({
      user: "Still talking.",
      partner: "",
    });
    expect(callbacks.onCaptionWarning).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(socket.closed).toBeFalsy();
  });

  it("falls back when the caption handshake fails", async () => {
    vi.mocked(createPracticeSession).mockResolvedValue({
      token: "auth_tokens/test",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 900_000,
      transcriptionToken: "auth_tokens/captions",
    });
    captions.start.mockRejectedValueOnce(new Error("unavailable"));
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: { inputTranscription: { text: "Hello." } },
    });
    expect(callbacks.onTranscript).toHaveBeenLastCalledWith({
      user: "Hello.",
      partner: "",
    });
    expect(callbacks.onCaptionWarning).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("waits for setup, streams multiple chunks, and flushes when muted", async () => {
    const { live } = setup();
    await live.start(selection);
    const socket = required(FakeSocket.instances[0]);
    const [, onAudio] = required(audio.prepare.mock.calls[0]);
    onAudio("pcm", 48_000);
    socket.open();
    socket.message({ setupComplete: {} });
    onAudio("first", 48_000);
    onAudio("second", 48_000);
    expect(socket.sent.at(-1)).toStrictEqual({
      realtimeInput: {
        audio: { data: "second", mimeType: "audio/pcm;rate=48000" },
      },
    });
    live.setMuted(true);
    expect(socket.sent.at(-1)).toStrictEqual({
      realtimeInput: { audioStreamEnd: true },
    });
    const count = socket.sent.length;
    onAudio("muted", 48_000);
    expect(socket.sent).toHaveLength(count);
    live.setMuted(false);
    onAudio("resumed", 48_000);
    expect(socket.sent).toHaveLength(count + 1);
  });

  it("updates streaming messages in place and gives repeated turns distinct identities", async () => {
    const { socket, callbacks } = await connect();
    socket.message({ serverContent: { outputTranscription: { text: "Hi" } } });
    socket.message({
      serverContent: {
        outputTranscription: { text: " there" },
        turnComplete: true,
      },
    });
    socket.message({
      serverContent: {
        inputTranscription: { text: "Hello" },
        outputTranscription: { text: "Hi there" },
      },
    });
    expect(callbacks.onMessage.mock.calls).toStrictEqual([
      [{ id: 1, speaker: "partner", text: "Hi" }],
      [{ id: 1, speaker: "partner", text: "Hi there" }],
      [{ id: 2, speaker: "user", text: "Hello" }],
      [{ id: 3, speaker: "partner", text: "Hi there" }],
    ]);
  });

  it("reports goodbye transcripts and the actual end-tool decision before closure", async () => {
    const fetchTrace = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchTrace);
    vi.mocked(createPracticeSession).mockResolvedValue({
      token: "auth_tokens/temporary",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 900_000,
      tracingToken: crypto.randomUUID(),
    });
    const { socket } = await connect();
    socket.message({
      serverContent: {
        inputTranscription: { text: "Yep. See ya." },
        outputTranscription: { text: "See you later!" },
        turnComplete: true,
      },
    });
    expect(audio.drainPlayback).not.toHaveBeenCalled();
    socket.message({
      toolCall: {
        functionCalls: [
          {
            id: "end",
            name: "end_conversation",
            args: { reason: "mutual_goodbye" },
          },
        ],
      },
    });
    socket.message({ toolCallCancellation: { ids: ["cancelled-call"] } });
    await vi.advanceTimersByTimeAsync(3000);
    required(audio.drainPlayback.mock.calls[0]?.[0])();
    await vi.advanceTimersByTimeAsync(0);
    const payload = fetchTrace.mock.calls
      .map(([, options]) => String(options?.body))
      .join(" ");
    for (const expected of [
      "Yep. See ya.",
      "end_conversation",
      '"accepted":true',
      '"name":"closed"',
      '"name":"review_requested"',
      '"detail":"transcript"',
      '"name":"tool_cancelled"',
      "cancelled-call",
    ]) {
      expect(payload).toContain(expected);
    }
    expect(payload).not.toContain("auth_tokens/temporary");
  });

  it("reviews after a model goodbye and closes only once the spoken recap drains", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: { inputTranscription: { text: "You too. See ya." } },
    });
    socket.message({
      toolCall: {
        functionCalls: [
          {
            id: "end-1",
            name: "end_conversation",
            args: { reason: "mutual_goodbye" },
          },
        ],
      },
    });
    expect(audio.dispose).not.toHaveBeenCalled();
    expect(audio.stopInput).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3000);
    required(audio.drainPlayback.mock.calls[0]?.[0])();
    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(callbacks.onState).toHaveBeenLastCalledWith("ended");
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("stops capture, drains final captions, and scores without a live feedback tool", async () => {
    const { live, socket, callbacks } = await connect();
    socket.message({
      serverContent: { inputTranscription: { text: "I like" } },
    });
    live.finish();
    expect({
      stopped: audio.stopInput.mock.calls.length,
      assessments: vi.mocked(finalizePracticeFeedback).mock.calls.length,
    }).toStrictEqual({ stopped: 1, assessments: 0 });
    live.setMuted(false);
    const [, onAudio] = required(audio.prepare.mock.calls[0]);
    const count = socket.sent.length;
    onAudio("late mic", 48_000);
    expect(socket.sent).toHaveLength(count);
    socket.message({
      serverContent: {
        inputTranscription: { text: " this cafe." },
        outputTranscription: { text: "Unheard roleplay" },
        modelTurn: {
          parts: [
            { inlineData: { data: "old", mimeType: "audio/pcm;rate=24000" } },
          ],
        },
      },
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(finalizePracticeFeedback).toHaveBeenCalledExactlyOnceWith(
      {
        selection,
        tracingToken: undefined,
        messages: [{ id: 1, speaker: "user", text: "I like this cafe." }],
      },
      expect.any(AbortSignal)
    );
    expect({
      closed: socket.closed,
      connections: FakeSocket.instances.length,
      feedback: callbacks.onFeedback.mock.calls,
      audio: audio.play.mock.calls,
      unheardText: JSON.stringify(callbacks.onMessage.mock.calls).includes(
        "Unheard roleplay"
      ),
    }).toStrictEqual({
      closed: true,
      connections: 1,
      feedback: [[{ status: "insufficient" }]],
      audio: [["recap", "audio/pcm;rate=24000"]],
      unheardText: false,
    });
  });

  it("shows written feedback before speech and preserves it when TTS fails", async () => {
    const deferred =
      Promise.withResolvers<
        Awaited<ReturnType<typeof speakPracticeFeedback>>
      >();
    vi.mocked(speakPracticeFeedback).mockReturnValueOnce(deferred.promise);
    const { live, callbacks } = await connect();
    live.finish();
    await vi.advanceTimersByTimeAsync(3000);
    expect(callbacks.onFeedback).toHaveBeenCalledWith({
      status: "insufficient",
    });
    expect(audio.play).not.toHaveBeenCalled();
    deferred.reject(new Error("TTS unavailable"));
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.onFeedbackError).toHaveBeenCalledWith(
      expect.stringContaining("written feedback is ready")
    );
    expect(callbacks.onState).toHaveBeenLastCalledWith("ended");
  });

  it("cancels pending assessment when skipped and ignores a late result", async () => {
    const deferred =
      Promise.withResolvers<
        Awaited<ReturnType<typeof finalizePracticeFeedback>>
      >();
    vi.mocked(finalizePracticeFeedback).mockReturnValueOnce(deferred.promise);
    const { live, socket, callbacks } = await connect();
    live.finish();
    await vi.advanceTimersByTimeAsync(3000);
    const signal = vi.mocked(finalizePracticeFeedback).mock.calls[0]?.[1];
    live.finish();
    deferred.resolve({ status: "insufficient" });
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBeTruthy();
    expect(callbacks.onFeedback).not.toHaveBeenCalled();
    expect(speakPracticeFeedback).not.toHaveBeenCalled();
    expect(socket.closed).toBeTruthy();
  });

  it("cancels pending speech and never plays a late TTS response", async () => {
    const deferred =
      Promise.withResolvers<
        Awaited<ReturnType<typeof speakPracticeFeedback>>
      >();
    vi.mocked(speakPracticeFeedback).mockReturnValueOnce(deferred.promise);
    const { live, callbacks } = await connect();
    live.finish();
    await vi.advanceTimersByTimeAsync(3000);
    live.finish();
    deferred.resolve({
      text: "late",
      audio: "late",
      mimeType: "audio/pcm;rate=24000",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(
      vi.mocked(speakPracticeFeedback).mock.calls[0]?.[1].aborted
    ).toBeTruthy();
    expect(audio.play).not.toHaveBeenCalled();
    expect(callbacks.onFeedbackError).not.toHaveBeenCalled();
  });

  it("skips during caption draining without sending an assessment", async () => {
    const { live } = await connect();
    live.finish();
    live.finish();
    await vi.advanceTimersByTimeAsync(3000);
    expect(finalizePracticeFeedback).not.toHaveBeenCalled();
  });

  it("bounds assessment waits without inventing feedback", async () => {
    vi.mocked(finalizePracticeFeedback).mockReturnValueOnce(
      Promise.withResolvers<
        Awaited<ReturnType<typeof finalizePracticeFeedback>>
      >().promise
    );
    const { live, callbacks } = await connect();
    live.finish();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(callbacks.onFeedbackError).toHaveBeenCalledOnce();
    expect(callbacks.onFeedback).not.toHaveBeenCalled();
    expect(callbacks.onState).toHaveBeenLastCalledWith("ended");
  });

  it("finishes feedback even when the live socket drops during caption draining", async () => {
    const { live, socket, callbacks } = await connect();
    live.finish();
    socket.disconnect();
    await vi.advanceTimersByTimeAsync(3000);
    expect(finalizePracticeFeedback).toHaveBeenCalledOnce();
    expect(speakPracticeFeedback).toHaveBeenCalledOnce();
    expect(callbacks.onFeedbackError).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("does not end from transcript keywords or an end action before hearing the user", async () => {
    const { socket } = await connect();
    socket.message({
      toolCall: {
        functionCalls: [
          {
            id: "early",
            name: "end_conversation",
            args: { reason: "mutual_goodbye" },
          },
        ],
      },
    });
    socket.message({
      serverContent: { inputTranscription: { text: "Thanks, what next?" } },
    });
    socket.message({
      toolCall: {
        functionCalls: [
          {
            id: "invalid",
            name: "end_conversation",
            args: { reason: "silence" },
          },
        ],
      },
    });
    expect(audio.drainPlayback).not.toHaveBeenCalled();
    expect(audio.dispose).not.toHaveBeenCalled();
  });

  it("processes transcripts and all audio parts together, and clears playback on interruption", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      serverContent: {
        inputTranscription: { text: "Hi there" },
        outputTranscription: { text: "Hello!" },
        modelTurn: {
          parts: [
            { inlineData: { data: "one", mimeType: "audio/pcm;rate=24000" } },
            { inlineData: { data: "two", mimeType: "audio/pcm;rate=24000" } },
          ],
        },
      },
    });
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(callbacks.onTranscript).toHaveBeenLastCalledWith({
      user: "Hi there",
      partner: "Hello!",
    });
    socket.message({
      serverContent: { interrupted: true, turnComplete: true },
    });
    expect(audio.stopPlayback).toHaveBeenCalledOnce();
    socket.message({
      serverContent: {
        inputTranscription: { text: "Actually" },
        outputTranscription: { text: "Go ahead" },
      },
    });
    expect(callbacks.onTranscript).toHaveBeenLastCalledWith({
      user: "Actually",
      partner: "Go ahead",
    });
  });

  it.each(["generationComplete", "turnComplete"])(
    "flushes the playback buffer after %s so short replies cannot get stuck",
    async (completion) => {
      const { socket } = await connect();
      socket.message({
        serverContent: {
          modelTurn: {
            parts: [
              {
                inlineData: { data: "short", mimeType: "audio/pcm;rate=24000" },
              },
            ],
          },
          [completion]: true,
        },
      });
      expect(audio.play).toHaveBeenCalledWith("short", "audio/pcm;rate=24000");
      expect(audio.finishPlayback).toHaveBeenCalledOnce();
      expect(audio.play).toHaveBeenCalledBefore(audio.finishPlayback);
    }
  );

  it("resumes the same session after a disconnect without repeating its greeting", async () => {
    const { socket, callbacks } = await connect();
    socket.message({
      sessionResumptionUpdate: { resumable: true, newHandle: "checkpoint" },
    });
    socket.message({ goAway: { timeLeft: "1s" } });
    socket.disconnect();
    expect(callbacks.onState).toHaveBeenLastCalledWith("reconnecting");
    await vi.advanceTimersByTimeAsync(500);
    const replacement = required(FakeSocket.instances[1]);
    replacement.open();
    expect(replacement.sent[0]).toMatchObject({
      setup: { sessionResumption: { handle: "checkpoint" } },
    });
    replacement.message({ setupComplete: {} });
    expect(replacement.sent).toHaveLength(1);
    socket.message({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: "stale", mimeType: "audio/pcm;rate=24000" } },
          ],
        },
      },
    });
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("cancels a connection during setup and ignores late events", async () => {
    const { live, callbacks } = setup();
    await live.start(selection);
    const socket = required(FakeSocket.instances[0]);
    live.close();
    socket.open();
    socket.message({ setupComplete: {} });
    expect(socket.closed).toBeTruthy();
    expect(socket.sent).toHaveLength(0);
    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(callbacks.onState).not.toHaveBeenCalledWith("listening");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores credentials returned after cancellation", async () => {
    const deferred = Promise.withResolvers<PracticeSession>();
    vi.mocked(createPracticeSession).mockReturnValueOnce(deferred.promise);
    const { live } = setup();
    const pending = live.start(selection);
    await Promise.resolve();
    live.close();
    deferred.resolve({
      token: "auth_tokens/late",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 900_000,
    });
    await pending;
    expect(FakeSocket.instances).toHaveLength(0);
    expect(audio.dispose).toHaveBeenCalledOnce();
  });

  it("stopping queued speech after turn completion does not silence the next reply", async () => {
    const { socket, live } = await connect();
    const chunk = {
      modelTurn: {
        parts: [
          { inlineData: { data: "audio", mimeType: "audio/pcm;rate=24000" } },
        ],
      },
    };
    socket.message({ serverContent: { ...chunk, turnComplete: true } });
    live.stopSpeaking();
    socket.message({ serverContent: chunk });
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.stopPlayback).toHaveBeenCalledOnce();
  });

  it("releases microphone and socket at session expiry", async () => {
    const { socket, callbacks } = await connect();
    await vi.advanceTimersByTimeAsync(900_000);
    expect(socket.closed).toBeTruthy();
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("15-minute")
    );
    expect(audio.dispose).toHaveBeenCalledOnce();
  });

  it("ends when setup does not complete", async () => {
    const { live, callbacks } = setup();
    await live.start(selection);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining("too long")
    );
    expect(required(FakeSocket.instances[0]).closed).toBeTruthy();
  });

  it("ends instead of buffering stale microphone audio on a slow connection", async () => {
    const { socket, callbacks } = await connect();
    socket.bufferedAmount = 300_000;
    required(audio.prepare.mock.calls.at(-1))[1]("pcm", 48_000);
    expect(socket.closed).toBeTruthy();
    expect(callbacks.onState).toHaveBeenLastCalledWith("ended");
  });

  async function connectChit() {
    const result = setup();
    await result.live.startCustomPlace();
    const socket = required(FakeSocket.instances.at(-1));
    socket.open();
    socket.message({ setupComplete: {} });
    return { ...result, socket };
  }
  const place = {
    name: "Rainy bookshop",
    description: "Wooden shelves and a coffee counter on a rainy evening.",
  };
  const placeCall = { id: "place-1", name: "summarize_place", args: place };

  it("opens a dedicated Chit session with its custom-place greeting", async () => {
    const { socket } = await connectChit();
    expect(createPracticeSession).not.toHaveBeenCalled();
    expect(createCustomPlaceSession).toHaveBeenCalledOnce();
    expect(socket.sent.at(-1)).toMatchObject({
      realtimeInput: { text: expect.stringContaining("Chit") },
    });
  });

  it("keeps situation summaries scoped to a situation session and closes after completion", async () => {
    const { live, callbacks } = setup();
    await live.startCustomSituation(place);
    const socket = required(FakeSocket.instances.at(-1));
    socket.open();
    socket.message({ setupComplete: {} });
    expect(createCustomSituationSession).toHaveBeenCalledWith(
      place,
      expect.any(AbortSignal)
    );
    const situation = {
      name: "Ask for a book recommendation",
      description: "Ask the bookseller to suggest a mystery novel.",
    };
    const situationCall = {
      id: "situation-1",
      name: "summarize_situation",
      args: situation,
    };
    socket.message({ toolCall: { functionCalls: [situationCall] } });
    expect(callbacks.onSituationSummary).not.toHaveBeenCalled();
    socket.message({
      serverContent: {
        inputTranscription: { text: "I'd like a book recommendation." },
      },
    });
    socket.message({ toolCall: { functionCalls: [placeCall] } });
    expect(callbacks.onPlaceSummary).not.toHaveBeenCalled();
    socket.message({ toolCall: { functionCalls: [situationCall] } });
    expect(callbacks.onSituationSummary).toHaveBeenCalledExactlyOnceWith(
      situation
    );
    expect(audio.dispose).toHaveBeenCalledOnce();
  });

  it("rejects summaries until a user has described a place and the arguments are valid", async () => {
    const { socket, callbacks } = await connectChit();
    socket.message({ toolCall: { functionCalls: [placeCall] } });
    expect(callbacks.onPlaceSummary).not.toHaveBeenCalled();
    expect(socket.sent.at(-1)).toMatchObject({
      toolResponse: {
        functionResponses: [{ response: { error: expect.any(String) } }],
      },
    });
    socket.message({
      serverContent: {
        inputTranscription: { text: "A quiet bookshop, please." },
      },
    });
    socket.message({
      toolCall: {
        functionCalls: [
          { ...placeCall, args: { name: "x".repeat(61), description: "" } },
        ],
      },
    });
    expect(callbacks.onPlaceSummary).not.toHaveBeenCalled();
    expect(socket.closed).toBeFalsy();
  });

  it("selects the place without closing the session and ignores duplicate place tools", async () => {
    const { socket, callbacks } = await connectChit();
    socket.message({
      serverContent: {
        inputTranscription: { text: "A quiet bookshop, please." },
      },
    });
    socket.message({ toolCall: { functionCalls: [placeCall] } });
    expect(socket.closed).toBeFalsy();
    expect(audio.dispose).not.toHaveBeenCalled();
    expect(createCustomSituationSession).not.toHaveBeenCalled();
    expect(socket.sent.at(-1)).toMatchObject({
      toolResponse: {
        functionResponses: [
          {
            response: {
              result: expect.stringContaining("Continue this conversation"),
            },
          },
        ],
      },
    });
    socket.message({ toolCall: { functionCalls: [placeCall] } });
    expect(callbacks.onPlaceSummary).toHaveBeenCalledExactlyOnceWith(place);
  });

  it("requires new situation input before completing the same session", async () => {
    const { socket, callbacks } = await connectChit();
    const situation = {
      name: "Book recommendation",
      description: "Ask the bookseller for a mystery novel.",
    };
    const situationCall = {
      id: "situation-1",
      name: "summarize_situation",
      args: situation,
    };
    socket.message({
      serverContent: {
        inputTranscription: { text: "A quiet bookshop, please." },
      },
    });
    socket.message({ toolCall: { functionCalls: [situationCall] } });
    socket.message({ toolCall: { functionCalls: [placeCall, situationCall] } });
    expect(callbacks.onSituationSummary).not.toHaveBeenCalled();
    socket.message({
      serverContent: {
        inputTranscription: { text: "I'd like a book recommendation." },
      },
    });
    socket.message({ toolCall: { functionCalls: [situationCall] } });
    socket.message({ toolCall: { functionCalls: [situationCall] } });
    expect(callbacks.onSituationSummary).toHaveBeenCalledExactlyOnceWith(
      situation
    );
    expect(socket.closed).toBeTruthy();
    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it.each(["summarize_place", "summarize_situation"])(
    "does not accept %s in a regular practice session",
    async (name) => {
      const { socket, callbacks } = await connect();
      socket.message({ serverContent: { inputTranscription: { text: "Hi" } } });
      socket.message({
        toolCall: {
          functionCalls: [
            {
              id: "1",
              name,
              args: { name: "Cafe", description: "Coffee." },
            },
          ],
        },
      });
      expect(callbacks.onPlaceSummary).not.toHaveBeenCalled();
      expect(callbacks.onSituationSummary).not.toHaveBeenCalled();
      expect(socket.closed).toBeFalsy();
    }
  );
});
