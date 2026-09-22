import {
  endConversationSchema,
  endConversationToolName,
  customChoiceSummarySchema,
  customPlaceToolName,
  customSituationToolName,
} from "@chitchat/contracts";
import type {
  PracticeFeedback,
  CustomPlaceSummary,
  CustomChoiceSummary,
  PracticeSelection,
  PracticeSession,
} from "@chitchat/contracts";
import type {
  FunctionCall,
  LiveClientRealtimeInput,
  LiveServerContent,
  LiveServerMessage,
} from "@google/genai";

import {
  finalizePracticeFeedback,
  speakPracticeFeedback,
  createCustomPlaceSession,
  createCustomSituationSession,
  createPracticeSession,
  suggestPracticeReply,
  PracticeApiError,
} from "./practice-api";
import { PracticeAudio } from "./practice-audio";
import { PracticeTraceQueue } from "./practice-tracing";
import { PracticeTranscription } from "./practice-transcription";

export type PracticeState =
  | "idle"
  | "starting"
  | "listening"
  | "talking"
  | "reconnecting"
  | "reviewing"
  | "ended";
export interface PracticeTranscript {
  user: string;
  partner: string;
}
export interface PracticeMessage {
  id: number;
  speaker: "user" | "partner";
  text: string;
  suggestionShown?: boolean;
}
export interface PracticeSuggestion {
  text: string;
  pending: boolean;
  error: string | null;
}
interface Callbacks {
  onState: (state: PracticeState) => void;
  onTranscript: (transcript: PracticeTranscript) => void;
  onError: (message: string) => void;
  onCaptionWarning?: (message: string) => void;
  onFeedback?: (feedback: PracticeFeedback) => void;
  onFeedbackError?: (message: string) => void;
  onMessage?: (message: PracticeMessage) => void;
  onSuggestion?: (suggestion: PracticeSuggestion | null) => void;
  onPlaceSummary?: (place: CustomPlaceSummary) => void;
  onSituationSummary?: (situation: CustomChoiceSummary) => void;
}

function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow it in your browser's site settings, then try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }
  if (error instanceof PracticeApiError) {
    return error.message;
  }
  return "Couldn't start the live conversation. Check your microphone and connection, then try again.";
}

export class PracticeLive {
  private suggestionTurns = new Set<number>();
  private suggestion: PracticeSuggestion | null = null;
  private suggestionRequest?: AbortController;
  private state: PracticeState = "idle";

  async suggestReply() {
    const messages = [...this.messages.values()];
    const partner = messages.at(-1);
    if (
      this.closed ||
      !this.selection ||
      this.state !== "listening" ||
      partner?.speaker !== "partner"
    ) {
      return;
    }
    this.cancelSuggestionRequest();
    const controller = new AbortController();
    this.suggestionRequest = controller;
    const previous = this.suggestion?.text ?? "";
    this.updateSuggestion({ text: previous, pending: true, error: null });
    try {
      const result = await suggestPracticeReply(
        {
          selection: this.selection,
          messages,
          ...(previous && { previous }),
        },
        controller.signal
      );
      // Turn changes and lifecycle transitions cancel even a late response.
      if (!controller.signal.aborted) {
        this.suggestionTurns.add(partner.id);
        this.updateSuggestion({
          text: result.text,
          pending: false,
          error: null,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        this.updateSuggestion({
          text: previous,
          pending: false,
          error:
            error instanceof PracticeApiError
              ? error.message
              : "Couldn't suggest a reply. Check your connection and try again.",
        });
      }
    } finally {
      if (this.suggestionRequest === controller) {
        this.suggestionRequest = undefined;
      }
    }
  }

  dismissSuggestion() {
    this.cancelSuggestionRequest();
    this.updateSuggestion(null);
  }

  private cancelSuggestionRequest() {
    this.suggestionRequest?.abort();
    this.suggestionRequest = undefined;
    if (this.suggestion?.pending) {
      this.updateSuggestion({ ...this.suggestion, pending: false });
    }
  }

  private updateSuggestion(suggestion: PracticeSuggestion | null) {
    this.suggestion = suggestion;
    this.callbacks.onSuggestion?.(suggestion);
  }

  private setState(state: PracticeState) {
    this.state = state;
    if (state !== "listening") {
      this.dismissSuggestion();
    }
    this.callbacks.onState(state);
  }

  private feedbackMessages() {
    let partnerId = -1;
    const result: PracticeMessage[] = [];
    for (const message of this.messages.values()) {
      if (!message.text.trim()) {
        continue;
      }
      if (message.speaker === "partner") {
        partnerId = message.id;
      }
      result.push({
        ...message,
        ...(message.speaker === "user" &&
          this.suggestionTurns.has(partnerId) && { suggestionShown: true }),
      });
    }
    return result;
  }

  private transcription?: PracticeTranscription;
  private captionIds = new Map<string, number>();
  private useIndependentCaptions = false;
  private trace?: PracticeTraceQueue;
  private traceDirty = { user: false, partner: false };
  private endReason = "client_closed";
  private controller = new AbortController();
  private audio: PracticeAudio;
  private socket?: WebSocket;
  private session?: PracticeSession;
  private ready = false;
  private closed = false;
  private muted = false;
  private resumeHandle?: string;
  private reconnects = 0;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private transcript: PracticeTranscript = { user: "", partner: "" };
  private newUserTurn = true;
  private newPartnerTurn = true;
  private messageId = 0;
  private messageIds = { user: 0, partner: 0 };
  private suppressAudio = false;
  private generating = false;
  private callbacks: Callbacks;
  private customChoice?: "place" | "situation";
  private heardUser = false;
  private selection?: PracticeSelection;
  private messages = new Map<number, PracticeMessage>();
  private reviewPhase?: "draining" | "assessing" | "speaking";
  private reviewTimer?: ReturnType<typeof setTimeout>;
  private captionDrainTimer?: ReturnType<typeof setTimeout>;
  private resolveCaptionDrain?: () => void;
  private reviewResult?: PracticeFeedback;
  private openingMessage =
    "Begin our conversation with a short greeting suited to the scene.";

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks;
    this.audio = new PracticeAudio((playing) => {
      if (!this.closed && (this.ready || this.reviewPhase === "speaking")) {
        this.trace?.record({
          type: "lifecycle",
          name: playing ? "playback_started" : "playback_finished",
        });
        if (!this.reviewPhase) {
          this.setState(playing ? "talking" : "listening");
        }
      }
    });
  }

  start(selection: PracticeSelection) {
    this.selection = selection;
    return this.startSession((signal) =>
      createPracticeSession(selection, signal)
    );
  }

  startCustomPlace() {
    this.customChoice = "place";
    this.openingMessage =
      "Introduce yourself as Chit and ask what kind of custom place I am imagining.";
    return this.startSession(createCustomPlaceSession);
  }

  startCustomSituation(place: CustomPlaceSummary) {
    this.customChoice = "situation";
    this.openingMessage =
      "Help me describe a custom situation at the place I have already chosen. Ask what I would like to happen there.";
    return this.startSession((signal) =>
      createCustomSituationSession(place, signal)
    );
  }

  private async startSession(
    createSession: (signal: AbortSignal) => Promise<PracticeSession>
  ) {
    this.setState("starting");
    try {
      await this.audio.prepare(
        this.controller.signal,
        (data, rate) => {
          if (this.ready && !this.muted && !this.reviewPhase) {
            this.send({ audio: { data, mimeType: `audio/pcm;rate=${rate}` } });
            this.transcription?.sendAudio(data, rate);
          }
        },
        (message) => this.fail(message)
      );
      this.controller.signal.throwIfAborted();
      this.session = await createSession(this.controller.signal);
      this.controller.signal.throwIfAborted();
      if (this.session.tracingToken) {
        this.trace = new PracticeTraceQueue(this.session.tracingToken);
      }
      this.expiryTimer = setTimeout(
        () =>
          this.fail(
            "This 15-minute practice session has ended. You can start another."
          ),
        Math.max(0, this.session.expiresAt - Date.now())
      );
      // Opt-in comparison using Gemini Live's built-in input captions.
      const standardCaptions =
        Boolean(this.selection) &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("captions") ===
          "standard";
      if (!standardCaptions) {
        if (this.session.transcriptionToken) {
          await this.startTranscription(this.session.transcriptionToken);
          this.controller.signal.throwIfAborted();
        } else if (this.session.transcriptionToken === null) {
          this.captionFallback();
        }
      }
      this.connect();
    } catch (error) {
      if (!this.closed) {
        this.fail(errorMessage(error));
      }
    }
  }

  private async startTranscription(token: string) {
    try {
      const transcription = new PracticeTranscription({
        onTurn: (itemId) => {
          if (
            this.closed ||
            (this.reviewPhase && this.reviewPhase !== "draining")
          ) {
            return;
          }
          this.messageId += 1;
          this.captionIds.set(itemId, this.messageId);
          this.messageIds.user = this.messageId;
          this.recordMessage({ id: this.messageId, speaker: "user", text: "" });
        },
        onText: (itemId, text) => {
          const id = this.captionIds.get(itemId);
          if (
            this.closed ||
            (this.reviewPhase && this.reviewPhase !== "draining") ||
            id === undefined
          ) {
            return;
          }
          this.heardUser ||= Boolean(text.trim());
          this.recordMessage({ id, speaker: "user", text });
          if (id === this.messageIds.user) {
            this.transcript.user = text;
            this.traceDirty.user = true;
            this.callbacks.onTranscript({ ...this.transcript });
          }
        },
        onFailure: () => this.captionFallback(),
      });
      this.transcription = transcription;
      this.useIndependentCaptions = true;
      await transcription.start(token, this.controller.signal);
    } catch {
      this.captionFallback();
    }
  }

  private captionFallback() {
    this.transcription?.close();
    this.transcription = undefined;
    this.useIndependentCaptions = false;
    this.newUserTurn = true;
    if (!this.closed) {
      this.callbacks.onCaptionWarning?.(
        "Enhanced captions disconnected. Using standard captions; your conversation can continue."
      );
    }
  }

  private connect() {
    if (this.closed || !this.session) {
      return;
    }
    this.ready = false;
    // Native WebSocket allows cancellation during setup and bounded send buffering.
    // The pinned SDK's live.connect() does not expose either capability.
    const url = new URL(
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained"
    );
    url.searchParams.set("access_token", this.session.token);
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    const current = () => !this.closed && this.socket === socket;
    this.connectionTimer = setTimeout(() => {
      if (current()) {
        this.fail("The live connection took too long. Please try again.");
      }
    }, 20_000);
    socket.addEventListener("open", () => {
      if (!current()) {
        return;
      }
      socket.send(
        JSON.stringify({
          setup: {
            model: `models/${this.session?.model}`,
            sessionResumption: this.resumeHandle
              ? { handle: this.resumeHandle }
              : {},
          },
        })
      );
    });
    socket.addEventListener(
      "message",
      (event: MessageEvent<string | ArrayBuffer>) => {
        if (!current()) {
          return;
        }
        try {
          const raw =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data);
          this.receive(JSON.parse(raw) as LiveServerMessage);
        } catch {
          this.fail("Couldn't play the live response. Please start again.");
        }
      }
    );
    socket.addEventListener("close", (event) => {
      if (!current()) {
        return;
      }
      if (this.reviewPhase) {
        // Feedback no longer depends on this connection.
        return;
      }
      this.trace?.record({
        type: "lifecycle",
        name: "disconnected",
        detail: String(event.code),
      });
      this.ready = false;
      clearTimeout(this.connectionTimer);
      this.audio.stopPlayback();
      // Never silently start a new conversation when the previous one cannot be resumed.
      if (this.resumeHandle && this.reconnects < 2 && event.code !== 1008) {
        this.trace?.record({ type: "lifecycle", name: "reconnecting" });
        this.reconnects += 1;
        this.setState("reconnecting");
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          500 * this.reconnects
        );
      } else {
        this.fail(
          event.code === 1008
            ? "Live voice is unavailable for this API key or session. Please check the backend configuration and try again."
            : "The live connection ended. Please start another conversation."
        );
      }
    });
    // A socket error is followed by close, which owns recovery and cleanup.
    socket.addEventListener("error", () => {
      if (current()) {
        socket.close();
      }
    });
  }

  private receive(message: LiveServerMessage) {
    if (message.toolCallCancellation) {
      this.trace?.record({
        type: "lifecycle",
        name: "tool_cancelled",
        detail: JSON.stringify(message.toolCallCancellation.ids ?? []).slice(
          0,
          1000
        ),
      });
    }
    if (message.setupComplete && !this.reviewPhase) {
      clearTimeout(this.connectionTimer);
      this.trace?.record({ type: "lifecycle", name: "connected" });
      this.ready = true;
      this.setState("listening");
      if (!this.resumeHandle) {
        this.send({ text: this.openingMessage });
      }
    }
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) {
      this.resumeHandle = update.newHandle;
    }
    // Keep the last resumable checkpoint during generation. On GoAway, continue
    // streaming until the server closes, then reconnect with that checkpoint.
    if (message.serverContent) {
      this.receiveContent(message.serverContent);
    }
    for (const call of message.toolCall?.functionCalls ?? []) {
      if (!this.closed) {
        this.receiveToolCall(call);
      }
    }
  }

  private toolResponse(call: FunctionCall, response: Record<string, unknown>) {
    this.socket?.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: [{ id: call.id, name: call.name, response }],
        },
      })
    );
  }

  private receiveEndConversation(call: FunctionCall) {
    const parsed = endConversationSchema.safeParse(call.args);
    const accepted = !this.reviewPhase && this.heardUser && parsed.success;
    this.traceTool(call, accepted);
    if (this.reviewPhase) {
      this.toolResponse(call, {
        error:
          "Practice is already finished. The app handles feedback separately.",
      });
    } else if (accepted && parsed.success) {
      this.endReason = parsed.data.reason;
      this.beginReview(call);
    } else {
      this.toolResponse(call, {
        error:
          "Wait for a clear user request to stop or mutual goodbye and provide a valid reason.",
      });
    }
  }

  // Finalize captions, then assess and speak independently of the live socket.
  finish() {
    if (this.closed) {
      return;
    }
    if (this.reviewPhase) {
      if (!this.reviewResult) {
        this.callbacks.onFeedbackError?.(
          "Feedback skipped. Try another conversation when you're ready."
        );
      }
      this.completeReview();
    } else if (
      !this.selection ||
      this.customChoice ||
      (!this.ready && this.messages.size === 0)
    ) {
      this.close();
      this.setState("ended");
    } else {
      this.endReason = "user_requested_stop";
      this.beginReview();
    }
  }

  private beginReview(call?: FunctionCall) {
    this.reviewPhase = "draining";
    this.trace?.record({
      type: "lifecycle",
      name: "ending",
      detail: this.endReason,
    });
    clearTimeout(this.expiryTimer);
    clearTimeout(this.connectionTimer);
    clearTimeout(this.reconnectTimer);
    this.audio.stopInput();
    this.audio.stopPlayback();
    this.suppressAudio = true;
    this.send({ audioStreamEnd: true });
    if (call && this.socket?.readyState === WebSocket.OPEN) {
      this.toolResponse(call, {
        result:
          "Practice is finished. Stop speaking; the app handles feedback separately.",
      });
    }
    this.setState("reviewing");
    this.reviewTimer = setTimeout(
      () =>
        this.fail(
          "Couldn't finish the feedback in time. Your conversation is still here."
        ),
      40_000
    );
    void this.assessAndSpeak();
  }

  private async assessAndSpeak() {
    try {
      // Both Live captions and the independent transcription connection can
      // deliver final words after microphone capture stops.
      const drain = Promise.withResolvers<undefined>();
      this.resolveCaptionDrain = () => drain.resolve();
      this.captionDrainTimer = setTimeout(this.resolveCaptionDrain, 3000);
      await Promise.all([this.transcription?.finish(), drain.promise]);
      if (this.closed || !this.selection) {
        return;
      }
      this.reviewPhase = "assessing";
      this.traceTranscripts();
      const { socket } = this;
      this.socket = undefined;
      socket?.close();
      this.ready = false;
      const tracingToken = this.session?.tracingToken;
      this.trace?.record({
        type: "lifecycle",
        name: "review_requested",
        detail: "transcript",
      });
      const feedback = await finalizePracticeFeedback(
        {
          selection: this.selection,
          messages: this.feedbackMessages(),
          tracingToken,
        },
        this.controller.signal
      );
      if (this.closed) {
        return;
      }
      this.reviewResult = feedback;
      this.callbacks.onFeedback?.(feedback);
      clearTimeout(this.reviewTimer);
      this.reviewTimer = setTimeout(
        () =>
          this.fail(
            "The voice recap couldn't finish. Your written feedback is ready."
          ),
        90_000
      );
      const recap = await speakPracticeFeedback(
        { selection: this.selection, feedback, tracingToken },
        this.controller.signal
      );
      if (this.closed) {
        return;
      }
      this.reviewPhase = "speaking";
      this.audio.play(recap.audio, recap.mimeType);
      this.audio.finishPlayback();
      this.audio.drainPlayback(() => {
        if (!this.closed) {
          this.completeReview();
        }
      });
    } catch {
      if (!this.closed) {
        this.fail(
          this.reviewResult
            ? "The voice recap couldn't finish. Your written feedback is ready."
            : "Couldn't assess this conversation. Your transcript is still here."
        );
      }
    }
  }

  private completeReview() {
    this.close();
    this.setState("ended");
  }

  private receiveToolCall(call: FunctionCall) {
    if (call.name === endConversationToolName && !this.customChoice) {
      this.receiveEndConversation(call);
      return;
    }
    const toolName =
      this.customChoice === "situation"
        ? customSituationToolName
        : customPlaceToolName;
    const onSummary =
      this.customChoice === "situation"
        ? this.callbacks.onSituationSummary
        : this.callbacks.onPlaceSummary;
    const allowed = this.customChoice && onSummary && call.name === toolName;
    const parsed = customChoiceSummarySchema.safeParse(call.args);
    const accepted = allowed && this.heardUser && parsed.success;
    const continuing = accepted && this.customChoice === "place";
    this.traceTool(call, Boolean(accepted));
    this.socket?.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: [
            {
              id: call.id,
              name: call.name,
              response: accepted
                ? {
                    result: continuing
                      ? "Place selected. Continue this conversation by asking what the user would like to happen there. Do not greet or introduce yourself again."
                      : "Situation selected. The conversation is complete.",
                  }
                : {
                    error: `Discuss and confirm the ${this.customChoice ?? "choice"} with the user first. Then call ${toolName} with a name of 1–60 characters and a description of 1–200 characters.`,
                  },
            },
          ],
        },
      })
    );
    if (accepted && parsed.success) {
      if (continuing) {
        this.customChoice = "situation";
        this.heardUser = false;
      } else {
        this.endReason = "setup_completed";
        this.close();
      }
      onSummary?.(parsed.data);
    }
  }

  private receiveContent(content: LiveServerContent) {
    if (this.reviewPhase) {
      if (this.reviewPhase === "draining") {
        this.receiveTranscript({
          inputTranscription: content.inputTranscription,
          outputTranscription: this.newPartnerTurn
            ? undefined
            : content.outputTranscription,
        });
        if (content.turnComplete) {
          this.newUserTurn = true;
          this.newPartnerTurn = true;
        }
      }
      return;
    }
    if (content.interrupted) {
      this.traceTranscripts();
      this.trace?.record({ type: "lifecycle", name: "interrupted" });
      this.audio.stopPlayback();
      this.suppressAudio = false;
      this.newPartnerTurn = true;
    }
    this.receiveTranscript(content);
    // Flash Live may return transcript AND multiple audio parts in a single event.
    if (content.modelTurn) {
      this.generating = true;
    }
    this.playContent(content);
    if (content.generationComplete || content.turnComplete) {
      this.audio.finishPlayback();
    }
    if (content.turnComplete) {
      this.traceTranscripts();
      this.generating = false;
      this.newUserTurn = true;
      this.newPartnerTurn = true;
      this.suppressAudio = false;
    }
  }

  private playContent(content: LiveServerContent) {
    if (!content.interrupted && !this.suppressAudio && !this.reviewPhase) {
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          this.audio.play(part.inlineData.data, part.inlineData.mimeType ?? "");
        }
      }
    }
  }

  private receiveTranscript(content: LiveServerContent) {
    this.heardUser ||= Boolean(content.inputTranscription?.text?.trim());
    if (content.inputTranscription?.text && !this.useIndependentCaptions) {
      this.traceDirty.user = true;
      if (this.newUserTurn) {
        this.messageId += 1;
        this.messageIds.user = this.messageId;
      }
      this.heardUser ||= Boolean(content.inputTranscription.text.trim());
      this.transcript.user =
        (this.newUserTurn ? "" : this.transcript.user) +
        content.inputTranscription.text;
      this.newUserTurn = false;
      this.recordMessage({
        id: this.messageIds.user,
        speaker: "user",
        text: this.transcript.user,
      });
    }
    if (content.outputTranscription?.text) {
      this.traceDirty.partner = true;
      if (this.newPartnerTurn) {
        this.messageId += 1;
        this.messageIds.partner = this.messageId;
      }
      this.transcript.partner =
        (this.newPartnerTurn ? "" : this.transcript.partner) +
        content.outputTranscription.text;
      this.newPartnerTurn = false;
      this.recordMessage({
        id: this.messageIds.partner,
        speaker: "partner",
        text: this.transcript.partner,
      });
    }
    if (content.inputTranscription?.text || content.outputTranscription?.text) {
      this.callbacks.onTranscript({ ...this.transcript });
    }
  }

  private recordMessage(message: PracticeMessage) {
    if (message.speaker === "partner") {
      this.dismissSuggestion();
    } else {
      this.cancelSuggestionRequest();
    }
    this.messages.set(message.id, message);
    this.callbacks.onMessage?.(message);
  }

  private traceTranscripts() {
    for (const speaker of ["user", "partner"] as const) {
      if (this.traceDirty[speaker]) {
        this.trace?.record({
          type: "transcript",
          speaker,
          text: this.transcript[speaker].slice(0, 8000),
          messageId: this.messageIds[speaker],
        });
        this.traceDirty[speaker] = false;
      }
    }
  }

  private traceTool(call: FunctionCall, accepted: boolean) {
    this.traceTranscripts();
    this.trace?.record({
      type: "tool",
      name: (call.name ?? "unknown").slice(0, 100),
      callId: call.id?.slice(0, 200),
      arguments: JSON.stringify(call.args ?? {}).slice(0, 2000),
      accepted,
    });
  }

  private send(realtimeInput: LiveClientRealtimeInput) {
    const { socket } = this;
    if (this.closed || !this.ready || socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    if (socket.bufferedAmount > 256_000) {
      this.fail(
        "Your connection couldn't keep up with live audio. Please try again."
      );
      return;
    }
    try {
      socket.send(JSON.stringify({ realtimeInput }));
    } catch {
      socket.close();
    }
  }

  setMuted(muted: boolean) {
    if (this.reviewPhase || this.closed) {
      return;
    }
    this.muted = muted;
    this.audio.setMuted(muted);
    if (muted) {
      this.send({ audioStreamEnd: true });
      this.transcription?.endAudio();
    }
  }

  stopSpeaking() {
    this.suppressAudio = this.generating;
    this.audio.stopPlayback();
  }

  getInputVolume() {
    return this.audio.inputVolume;
  }
  getOutputVolume() {
    return this.audio.getOutputVolume();
  }

  getAnalyser() {
    return this.audio.getAnalyser();
  }

  private fail(message: string) {
    if (this.closed) {
      return;
    }
    this.endReason = "error";
    this.trace?.record({
      type: "lifecycle",
      name: "error",
      detail: message.slice(0, 1000),
    });
    if (this.reviewPhase) {
      this.callbacks.onFeedbackError?.(message);
    } else {
      this.callbacks.onError(message);
    }
    this.close();
    this.setState("ended");
  }

  close() {
    if (this.closed) {
      return;
    }
    this.traceTranscripts();
    this.trace?.record({
      type: "lifecycle",
      name: "closed",
      detail: this.endReason,
    });
    this.trace?.close();
    this.closed = true;
    this.dismissSuggestion();
    this.ready = false;
    this.controller.abort();
    this.transcription?.close();
    clearTimeout(this.reviewTimer);
    clearTimeout(this.captionDrainTimer);
    this.resolveCaptionDrain?.();
    clearTimeout(this.expiryTimer);
    clearTimeout(this.connectionTimer);
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = undefined;
    this.session = undefined;
    this.resumeHandle = undefined;
    this.audio.dispose();
  }
}
