import { practiceTraceEventSchema } from "@chitchat/contracts";
import {
  onboardingCompleteSchema,
  onboardingCompleteToolName,
} from "@chitchat/contracts/onboarding";
import type {
  OnboardingComplete,
  OnboardingLiveRequest,
  OnboardingLiveSession,
  OnboardingMessage,
  OnboardingTurn,
  OnboardingVoiceCompletion,
} from "@chitchat/contracts/onboarding";
import type {
  FunctionCall,
  LiveServerContent,
  LiveServerMessage,
  Transcription,
} from "@google/genai";

import { constrainedLiveUrl, liveFrameText } from "./gemini-live-protocol";
import { OnboardingTranscript } from "./onboarding-transcript";
import {
  completeOnboardingVoice,
  createOnboardingSession,
  PracticeApiError,
} from "./practice-api";
import { PracticeAudio } from "./practice-audio";
import type { PlaybackPosition } from "./practice-audio";
import { PracticeTraceQueue } from "./practice-tracing";

export type OnboardingLivePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ready";

export interface OnboardingLiveMessage extends OnboardingMessage {
  id: number;
  final: boolean;
}

interface Utterance extends OnboardingLiveMessage {
  visible: boolean;
}

interface OutputTurn {
  message: Utterance;
  transcript: OnboardingTranscript;
  origin?: PlaybackPosition;
  chunks: { data: string; mimeType: string }[];
  hasAudio: boolean;
  started: boolean;
  complete: boolean;
  generated: boolean;
  drained: boolean;
  drainRequested: boolean;
}

interface Completion {
  id: string;
  outcome: OnboardingComplete;
  inputId?: number;
  awaitingInput: boolean;
  afterOutputId: number;
  acknowledgment?: OutputTurn;
  request?: AbortController;
  result?: OnboardingVoiceCompletion;
}

interface Callbacks {
  onPhase: (phase: OnboardingLivePhase) => void;
  onMessages: (
    messages: OnboardingLiveMessage[],
    confirmed: OnboardingMessage[]
  ) => void;
  onComplete: (result: OnboardingTurn) => void;
  onError: (message: string, recovery?: "text") => void;
}

function startError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow it in your browser's site settings, then restart voice.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found. Connect one and restart voice, or switch to text.";
  }
  if (error instanceof PracticeApiError) {
    return error.message;
  }
  return "Couldn't start voice. Check your microphone and connection, then restart voice or switch to text.";
}

// A controller is one disposable attempt. Restarting never reuses its token,
// messages, microphone, tool results, or provider session.
export class OnboardingLive {
  private readonly callbacks: Callbacks;
  private readonly audio: PracticeAudio;
  private readonly controller = new AbortController();
  private socket?: WebSocket;
  private session?: OnboardingLiveSession;
  private learner?: OnboardingLiveRequest;
  private trace?: PracticeTraceQueue;
  private closed = false;
  private started = false;
  private connected = false;
  private paused = false;
  private playing = false;
  private awaitingReply = false;
  private phase: OnboardingLivePhase = "idle";
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private setupTimer?: ReturnType<typeof setTimeout>;
  private completionTimer?: ReturnType<typeof setTimeout>;
  private deadline = 0;
  private messages: Utterance[] = [];
  private nextId = 0;
  private input?: Utterance;
  private output?: OutputTurn;
  private playback?: OutputTurn;
  private playbackQueue: OutputTurn[] = [];
  private bufferedAudio = 0;
  private completion?: Completion;
  private toolReplies = new Map<string, Record<string, unknown>>();

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks;
    this.audio = new PracticeAudio(
      (playing) => {
        if (this.closed) {
          return;
        }
        this.playing = playing;
        this.trace?.record({
          type: "lifecycle",
          name: playing ? "playback_started" : "playback_finished",
        });
        this.updatePhase();
      },
      (position) => this.revealPlayback(position)
    );
  }

  async start(learner: OnboardingLiveRequest) {
    if (this.started || this.closed) {
      return;
    }
    this.started = true;
    this.learner = { name: learner.name, language: learner.language };
    this.setPhase("connecting");
    this.deadline = Date.now() + 180_000;
    this.deadlineTimer = setTimeout(() => this.expire(), 180_000);
    this.setupTimer = setTimeout(
      () =>
        this.fail(
          "The voice connection took too long. Restart voice or switch to text."
        ),
      20_000
    );
    try {
      await this.audio.prepare(
        this.controller.signal,
        (data, rate) => {
          if (this.connected && !this.paused) {
            this.send({
              realtimeInput: {
                audio: { data, mimeType: `audio/pcm;rate=${rate}` },
              },
            });
          }
        },
        (message) => this.fail(message, true)
      );
      this.controller.signal.throwIfAborted();
      this.audio.setMuted(this.paused);
      this.session = await createOnboardingSession(
        this.learner,
        this.controller.signal
      );
      this.controller.signal.throwIfAborted();
      if (this.session.tracingToken) {
        this.trace = new PracticeTraceQueue(this.session.tracingToken);
      }
      if (this.session.expiresAt <= Date.now()) {
        this.expire();
        return;
      }
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = setTimeout(
        () => this.expire(),
        Math.min(this.deadline, this.session.expiresAt) - Date.now()
      );
      this.connect(this.session);
    } catch (error) {
      if (!this.closed) {
        this.fail(
          startError(error),
          false,
          error instanceof PracticeApiError &&
            (error.status === 429 || error.status === 503)
            ? "text"
            : undefined
        );
      }
    }
  }

  private connect(session: OnboardingLiveSession) {
    // Native sockets allow setup cancellation and a bounded outgoing buffer.
    // All model, voice, transcription, and tool settings are locked in Hono's token.
    const url = constrainedLiveUrl(session.token, "v1beta");
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    const current = () => !this.closed && this.socket === socket;
    socket.addEventListener("open", () => {
      if (current()) {
        this.send({ setup: { model: `models/${session.model}` } });
      }
    });
    socket.addEventListener(
      "message",
      (event: MessageEvent<string | ArrayBuffer>) => {
        if (!current()) {
          return;
        }
        try {
          const raw = liveFrameText(event.data);
          this.receive(JSON.parse(raw) as LiveServerMessage);
        } catch {
          this.fail(
            "Couldn't play the voice response. Restart voice or switch to text.",
            true
          );
        }
      }
    );
    socket.addEventListener("close", () => {
      if (current()) {
        this.fail(
          "The voice connection ended. Restart voice or switch to text."
        );
      }
    });
    socket.addEventListener("error", () => {
      if (current()) {
        this.fail(
          "Couldn't connect to voice. Restart voice or switch to text."
        );
      }
    });
  }

  private receive(message: LiveServerMessage) {
    if (this.closed) {
      return;
    }
    if ("error" in message) {
      this.fail(
        "Voice is unavailable right now. Restart voice or switch to text."
      );
      return;
    }
    this.recordUsage(message);
    if (message.setupComplete && !this.connected) {
      this.connected = true;
      this.awaitingReply = true;
      clearTimeout(this.setupTimer);
      this.trace?.record({ type: "lifecycle", name: "connected" });
      this.setPhase("thinking");
      this.send({
        realtimeInput: {
          text: "Start by asking me one short question about what I would like to practice in conversations.",
        },
      });
    }
    if (message.toolCallCancellation?.ids) {
      for (const id of message.toolCallCancellation.ids) {
        this.toolReplies.set(id, {
          error:
            "This completion was canceled. Listen to the learner and use a new call if needed.",
        });
        if (this.completion?.id === id) {
          this.interrupt();
        }
      }
    }
    if (
      message.voiceActivity?.voiceActivityType === "ACTIVITY_START" &&
      this.completion
    ) {
      this.interrupt();
    }
    // Content in a tool-call envelope still belongs to the pre-tool response.
    if (message.serverContent) {
      this.receiveContent(message.serverContent);
    }
    for (const call of message.toolCall?.functionCalls ?? []) {
      if (!this.closed) {
        this.receiveTool(call);
      }
    }
  }

  private recordUsage(message: LiveServerMessage) {
    if (!message.usageMetadata || !this.trace) {
      return;
    }
    const usage = practiceTraceEventSchema.safeParse({
      type: "usage",
      usage: message.usageMetadata,
      sequence: 0,
      timestamp: Date.now(),
    });
    if (usage.success && usage.data.type === "usage") {
      this.trace.record({ type: "usage", usage: usage.data.usage });
    }
  }

  private newMessage(role: OnboardingMessage["role"]) {
    if (this.messages.length >= 24) {
      this.fail(
        "This voice conversation reached its limit. Choose your skills, restart voice, or switch to text."
      );
      return;
    }
    this.nextId += 1;
    const message: Utterance = {
      id: this.nextId,
      role,
      text: "",
      final: false,
      visible: role === "user",
    };
    this.messages.push(message);
    return message;
  }

  private transcribe(output: OutputTurn, transcription: Transcription) {
    if (
      output.transcript.text.length + (transcription.text?.length ?? 0) >
      500
    ) {
      this.fail(
        "That answer was too long for this short setup. Restart voice with a shorter answer, switch to text, or choose your skills."
      );
      return;
    }
    output.transcript.append(transcription);
    this.revealPlayback(this.audio.getPlaybackPosition());
  }

  private revealPlayback(position: PlaybackPosition) {
    const output = this.playback;
    if (
      this.closed ||
      !output?.origin ||
      output.origin.generation !== position.generation
    ) {
      return;
    }
    const consumed = position.consumedSamples - output.origin.submittedSamples;
    if (consumed <= 0) {
      return;
    }
    output.started = true;
    const text = output.transcript.prefix(
      consumed / position.sampleRate,
      output.generated
        ? (position.submittedSamples - output.origin.submittedSamples) /
            position.sampleRate
        : undefined
    );
    if (output.message.text !== text) {
      output.message.visible = true;
      output.message.text = text;
      this.publish();
    }
  }

  private finalizeMessage(message: Utterance) {
    if (message.final) {
      return;
    }
    message.final = true;
    if (message.text.trim()) {
      this.trace?.record({
        type: "transcript",
        speaker: message.role === "user" ? "user" : "partner",
        text: message.text.trim(),
        messageId: message.id,
      });
    }
  }

  private receiveInput(transcription: Transcription, final: boolean) {
    if (!this.input || this.input.final) {
      if (!transcription.text?.trim()) {
        return;
      }
      const { completion } = this;
      if (completion && !completion.awaitingInput) {
        // A new utterance after the completed answer is a correction. A late
        // final fragment of the original answer keeps the same input ID below.
        this.interrupt();
      }
      this.input = this.newMessage("user");
      if (this.completion && this.input) {
        this.completion.inputId = this.input.id;
      }
    }
    if (!this.input) {
      return;
    }
    // 3.8 Live sends interim hypotheses separately. Its authoritative input
    // segment replaces the hypothesis; it does not necessarily carry finished.
    const text = transcription.text ?? this.input.text;
    if (text.length > 500) {
      this.fail(
        "That answer was too long for this short setup. Restart voice with a shorter answer, switch to text, or choose your skills."
      );
      return;
    }
    this.input.text = text;
    if (final) {
      this.finalizeMessage(this.input);
    }
    this.awaitingReply = final;
    if (
      this.completion &&
      this.input.final &&
      this.completion.inputId === this.input.id
    ) {
      this.completion.awaitingInput = false;
    }
    this.publish();
    void this.finalizeCompletion();
  }

  private createOutput() {
    const message = this.newMessage("assistant");
    if (!message) {
      return;
    }
    const output: OutputTurn = {
      message,
      transcript: new OnboardingTranscript(),
      chunks: [],
      hasAudio: false,
      started: false,
      complete: false,
      generated: false,
      drained: false,
      drainRequested: false,
    };
    this.output = output;
    this.awaitingReply = false;
    this.playbackQueue.push(output);
    this.playback ??= output;
    if (this.playback === output) {
      output.origin = this.audio.getPlaybackPosition();
    }
    if (this.completion && message.id > this.completion.afterOutputId) {
      this.completion.acknowledgment = output;
    }
    return output;
  }

  private receiveContent(content: LiveServerContent) {
    if (content.interrupted) {
      this.interrupt();
    }
    if (content.interimInputTranscription) {
      this.receiveInput(content.interimInputTranscription, false);
    }
    if (content.inputTranscription) {
      this.receiveInput(content.inputTranscription, true);
    }
    if (this.closed || content.interrupted) {
      return;
    }
    const hasOutput = Boolean(content.outputTranscription || content.modelTurn);
    let { output } = this;
    if (hasOutput && (!output || output.complete)) {
      output = this.createOutput();
    }
    if (output && content.outputTranscription) {
      this.transcribe(output, content.outputTranscription);
      this.publish();
    }
    this.receiveAudio(content, output);
    if (this.closed) {
      return;
    }
    if (output && (content.generationComplete || content.turnComplete)) {
      output.generated = true;
      if (output === this.playback) {
        this.revealPlayback(this.audio.getPlaybackPosition());
        this.audio.finishPlayback();
      }
    }
    if (output && content.turnComplete) {
      output.complete = true;
      this.drain(output);
    }
    this.updatePhase();
    this.maybeComplete();
  }

  private receiveAudio(content: LiveServerContent, output?: OutputTurn) {
    if (this.closed || !output) {
      return;
    }
    for (const part of content.modelTurn?.parts ?? []) {
      if (!part.inlineData?.data) {
        continue;
      }
      output.hasAudio = true;
      const chunk = {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "",
      };
      if (output === this.playback) {
        this.audio.play(chunk.data, chunk.mimeType);
      } else {
        this.bufferedAudio += chunk.data.length;
        if (this.bufferedAudio > 2_000_000) {
          this.fail(
            "Voice playback fell behind. Restart voice or switch to text.",
            true
          );
          return;
        }
        output.chunks.push(chunk);
      }
    }
  }

  private drain(output: OutputTurn) {
    if (output !== this.playback || !output.complete || output.drainRequested) {
      return;
    }
    output.drainRequested = true;
    this.audio.drainPlayback(() => {
      if (this.closed || this.playback !== output) {
        return;
      }
      output.drained = true;
      if (output.hasAudio && output.started) {
        output.message.text = output.transcript.text;
        output.message.visible = true;
        this.finalizeMessage(output.message);
      }
      this.publish();
      this.playbackQueue.shift();
      [this.playback] = this.playbackQueue;
      try {
        if (this.playback) {
          this.playback.origin = this.audio.getPlaybackPosition();
          for (const chunk of this.playback.chunks) {
            this.bufferedAudio -= chunk.data.length;
            this.audio.play(chunk.data, chunk.mimeType);
          }
          this.playback.chunks = [];
          if (this.playback.generated) {
            this.audio.finishPlayback();
          }
          if (this.playback.complete) {
            this.drain(this.playback);
          }
        }
      } catch {
        this.fail(
          "Couldn't play the voice response. Restart voice or switch to text.",
          true
        );
        return;
      }
      this.updatePhase();
      this.maybeComplete();
    });
  }

  private receiveTool(call: FunctionCall) {
    if (!call.id || call.name !== onboardingCompleteToolName) {
      this.respond(call, {
        error:
          "Use complete_onboarding with a call ID and a valid ready or choose outcome.",
      });
      return;
    }
    const previous = this.toolReplies.get(call.id);
    if (previous) {
      this.respond(call, previous);
      return;
    }
    if (this.toolReplies.size >= 32) {
      this.fail(
        "Voice couldn't finish this goal. Restart voice, switch to text, or choose your skills."
      );
      return;
    }
    const parsed = onboardingCompleteSchema.safeParse(call.args);
    const accepted = parsed.success && !this.completion;
    this.trace?.record({
      type: "tool",
      name: call.name,
      callId: call.id,
      arguments: JSON.stringify(call.args ?? {}).slice(0, 2000),
      accepted,
    });
    if (!parsed.success || this.completion) {
      const response = {
        error:
          "Provide a valid goal and skill IDs, or choose with an empty goal and no skills. Wait for any accepted completion to finish.",
      };
      this.toolReplies.set(call.id, response);
      this.respond(call, response);
      return;
    }
    this.completion = {
      id: call.id,
      outcome: parsed.data,
      inputId: this.input?.id,
      awaitingInput:
        Boolean(this.input && !this.input.final) ||
        (parsed.data.status === "ready" &&
          !this.messages.some(
            (message) =>
              message.role === "user" && message.final && message.text.trim()
          )),
      afterOutputId: this.nextId,
    };
    if (this.output && !this.output.complete) {
      this.output.generated = true;
      this.output.complete = true;
      if (this.output === this.playback) {
        this.revealPlayback(this.audio.getPlaybackPosition());
        this.audio.finishPlayback();
      }
      this.drain(this.output);
    }
    this.output = undefined;
    const response = {
      accepted: true,
      provisional: true,
      instruction:
        "Now speak one short acknowledgment, then finish your turn. Do not ask another question.",
    };
    this.toolReplies.set(call.id, response);
    this.respond(call, response);
    if (this.closed) {
      return;
    }
    this.completionTimer = setTimeout(
      () =>
        this.fail(
          "Couldn't finish the voice response. Restart voice, switch to text, or choose your skills."
        ),
      25_000
    );
    void this.finalizeCompletion();
    this.updatePhase();
  }

  private async finalizeCompletion() {
    const { completion } = this;
    if (
      this.closed ||
      !completion ||
      completion.awaitingInput ||
      completion.request ||
      !this.learner
    ) {
      return;
    }
    const request = new AbortController();
    completion.request = request;
    const messages = this.confirmed();
    try {
      const result = await completeOnboardingVoice(
        { ...this.learner, outcome: completion.outcome, messages },
        request.signal
      );
      if (
        !this.closed &&
        this.completion === completion &&
        !request.signal.aborted
      ) {
        completion.result = result;
        this.maybeComplete();
      }
    } catch {
      if (
        !this.closed &&
        this.completion === completion &&
        !request.signal.aborted
      ) {
        this.fail(
          "Couldn't finish your goal. Restart voice, switch to text, or choose your skills."
        );
      }
    }
  }

  private maybeComplete() {
    const { completion } = this;
    const acknowledgment = completion?.acknowledgment;
    if (
      this.closed ||
      !completion?.result ||
      completion.awaitingInput ||
      !acknowledgment?.hasAudio ||
      !acknowledgment.started ||
      !acknowledgment.complete ||
      !acknowledgment.drained ||
      !acknowledgment.message.final ||
      !acknowledgment.message.text.trim()
    ) {
      return;
    }
    const result = {
      ...completion.result,
      reply: acknowledgment.message.text.trim().slice(0, 240),
    };
    this.setPhase("ready");
    this.close();
    this.callbacks.onComplete(result);
  }

  private interrupt() {
    if (this.completion) {
      this.toolReplies.set(this.completion.id, {
        error:
          "The learner interrupted this completion. Listen and use a new call for their corrected goal.",
      });
      this.completion.request?.abort();
      this.completion = undefined;
    }
    clearTimeout(this.completionTimer);
    this.trace?.record({ type: "lifecycle", name: "interrupted" });
    for (const output of this.playbackQueue) {
      output.message.final = false;
    }
    this.output = undefined;
    this.playback = undefined;
    this.playbackQueue = [];
    this.bufferedAudio = 0;
    this.playing = false;
    this.awaitingReply = false;
    this.audio.stopPlayback();
    this.publish();
    this.updatePhase();
  }

  private respond(call: FunctionCall, response: Record<string, unknown>) {
    this.send({
      toolResponse: {
        functionResponses: [{ id: call.id, name: call.name, response }],
      },
    });
  }

  private send(message: object) {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.socket.bufferedAmount > 256_000) {
      this.fail(
        "Your connection couldn't keep up with live audio. Restart voice or switch to text."
      );
      return;
    }
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      this.fail("The voice connection ended. Restart voice or switch to text.");
    }
  }

  private confirmed(): OnboardingMessage[] {
    return this.messages
      .filter(
        (message) => message.final && message.visible && message.text.trim()
      )
      .map(({ role, text }) => ({ role, text: text.trim() }));
  }

  private publish() {
    if (this.closed) {
      return;
    }
    const visible = this.messages
      .filter((message) => message.visible && message.text.trim())
      .map(({ id, role, text, final }) => ({
        id,
        role,
        text: text.trim(),
        final,
      }));
    this.callbacks.onMessages(visible, this.confirmed());
  }

  private setPhase(phase: OnboardingLivePhase) {
    if (this.closed || phase === this.phase) {
      return;
    }
    this.phase = phase;
    this.callbacks.onPhase(phase);
  }

  private updatePhase() {
    if (!this.connected) {
      return;
    }
    if (this.playing) {
      this.setPhase("speaking");
    } else if (this.completion || this.playback || this.awaitingReply) {
      this.setPhase("thinking");
    } else {
      this.setPhase(this.paused ? "idle" : "listening");
    }
  }

  pause() {
    if (this.closed) {
      return;
    }
    this.paused = true;
    this.audio.setMuted(true);
    this.send({ realtimeInput: { audioStreamEnd: true } });
    this.updatePhase();
  }

  resume() {
    if (this.closed) {
      return;
    }
    this.paused = false;
    this.audio.setMuted(false);
    this.updatePhase();
  }

  getInputVolume() {
    return this.closed || this.paused ? 0 : this.audio.inputVolume;
  }

  getAnalyser() {
    return this.closed ? undefined : this.audio.getAnalyser();
  }

  private expire() {
    this.fail(
      "This three-minute voice setup has ended. Restart voice, switch to text, or choose your skills."
    );
  }

  private fail(message: string, revealTranscript = false, recovery?: "text") {
    if (this.closed) {
      return;
    }
    if (revealTranscript) {
      this.publish();
    }
    this.trace?.record({ type: "lifecycle", name: "error", detail: message });
    this.setPhase("idle");
    this.close();
    if (recovery) {
      this.callbacks.onError(message, recovery);
    } else {
      this.callbacks.onError(message);
    }
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.connected = false;
    this.controller.abort();
    this.completion?.request?.abort();
    this.completion = undefined;
    clearTimeout(this.deadlineTimer);
    clearTimeout(this.setupTimer);
    clearTimeout(this.completionTimer);
    this.socket?.close();
    this.socket = undefined;
    this.session = undefined;
    this.playbackQueue = [];
    this.bufferedAudio = 0;
    this.trace?.record({ type: "lifecycle", name: "closed" });
    this.trace?.close();
    this.audio.dispose();
  }
}
