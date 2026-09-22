import type { GuidedTurn, PracticeSelection } from "@chitchat/contracts";

import { matchPhrase, speechWords } from "./phrase-progress";
import {
  PracticeApiError,
  createTranscriptionSession,
  generateGuidedTurn,
  speakPracticeTurn,
} from "./practice-api";
import { PracticeAudio } from "./practice-audio";
import type {
  PracticeMessage,
  PracticeState,
  PracticeTranscript,
} from "./practice-live";
import { PracticeTranscription } from "./practice-transcription";

export interface GuidedProgress {
  text: string;
  confirmed: number;
  preview: number;
  phase: "preparing" | "listening" | "complete" | "error";
  completed: number;
  skipped: number;
}
export const emptyGuidedProgress: GuidedProgress = {
  text: "",
  confirmed: 0,
  preview: 0,
  phase: "preparing",
  completed: 0,
  skipped: 0,
};

interface Callbacks {
  onState: (state: PracticeState) => void;
  onTranscript: (transcript: PracticeTranscript) => void;
  onMessage: (message: PracticeMessage) => void;
  onError: (error: string) => void;
  onProgress: (progress: GuidedProgress) => void;
}

export class PracticeGuided {
  private audio: PracticeAudio;
  private recognition?: PracticeTranscription;
  private controller = new AbortController();
  private operation?: AbortController;
  private selection?: PracticeSelection;
  private messages: PracticeMessage[] = [];
  private progress = { ...emptyGuidedProgress };
  private turn?: GuidedTurn;
  private words: string[] = [];
  private generation = 0;
  private closed = false;
  private muted = false;
  private busy = false;
  private nextSkipped = false;
  private quietTimer?: ReturnType<typeof setInterval>;
  private lastVoiceAt = 0;
  private finalSegments = new Set<string>();

  private callbacks: Callbacks;

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks;
    this.audio = new PracticeAudio(() => {
      // Guided state follows playback drain, not individual audio chunks.
    });
  }

  async start(selection: PracticeSelection) {
    this.selection = selection;
    this.callbacks.onState("starting");
    try {
      await this.audio.prepare(
        this.controller.signal,
        (data, rate) => {
          if (this.progress.phase !== "listening" || this.muted || this.busy) {
            return;
          }
          if (this.audio.inputVolume > 0.035) {
            this.lastVoiceAt = Date.now();
          }
          this.recognition?.sendAudio(data, rate);
        },
        (message) => this.failAudio(message)
      );
      this.audio.setMuted(true);
      await this.advance();
    } catch {
      if (!this.closed) {
        this.failAudio(
          "Couldn't open your microphone. Check microphone access and start again."
        );
      }
    }
  }

  private failAudio(message: string) {
    if (this.closed) {
      return;
    }
    this.callbacks.onError(message);
    this.finish();
  }

  private publish(update: Partial<GuidedProgress>) {
    this.progress = { ...this.progress, ...update };
    this.callbacks.onProgress(this.progress);
  }

  private stopRecognition() {
    clearInterval(this.quietTimer);
    this.quietTimer = undefined;
    this.recognition?.close();
    this.recognition = undefined;
    this.audio.setMuted(true);
  }

  private fail(message: string) {
    if (this.closed) {
      return;
    }
    this.generation += 1;
    this.operation?.abort();
    this.busy = false;
    this.stopRecognition();
    this.audio.stopPlayback();
    this.publish({ phase: "error" });
    this.callbacks.onState("listening");
    this.callbacks.onError(message);
  }

  private append(speaker: PracticeMessage["speaker"], text: string) {
    const message = { id: this.messages.length, speaker, text };
    this.messages.push(message);
    this.callbacks.onMessage(message);
    this.callbacks.onTranscript({
      user: speaker === "user" ? text : "",
      partner: speaker === "partner" ? text : "",
    });
  }

  private async advance() {
    if (this.closed || !this.selection || this.busy) {
      return;
    }
    this.busy = true;
    this.generation += 1;
    const { generation } = this;
    this.stopRecognition();
    this.operation?.abort();
    this.operation = new AbortController();
    const signal = AbortSignal.any([
      this.controller.signal,
      this.operation.signal,
      AbortSignal.timeout(75_000),
    ]);
    this.publish({ phase: "preparing", text: "", confirmed: 0, preview: 0 });
    this.callbacks.onError("");
    this.callbacks.onState("starting");
    try {
      // Keep generated text on speech failure so Retry never adds another partner turn.
      this.turn ??= await generateGuidedTurn(
        {
          selection: this.selection,
          messages: [...this.messages],
          skipped: this.nextSkipped,
        },
        signal
      );
      signal.throwIfAborted();
      const speech = await speakPracticeTurn(
        { selection: this.selection, text: this.turn.text },
        signal
      );
      signal.throwIfAborted();
      if (this.closed || generation !== this.generation) {
        return;
      }
      this.words = speechWords(this.turn.reply);
      if (!this.words.length) {
        throw new Error("Empty speaking prompt.");
      }
      this.append("partner", this.turn.text);
      this.publish({ text: this.turn.reply });
      this.audio.play(speech.audio, speech.mimeType);
      this.audio.finishPlayback();
      this.callbacks.onState("talking");
      this.audio.drainPlayback(() => {
        if (this.closed || generation !== this.generation) {
          return;
        }
        this.busy = false;
        void this.listen();
      });
    } catch (error) {
      if (!this.closed && generation === this.generation) {
        this.fail(
          error instanceof PracticeApiError
            ? error.message
            : "Couldn't prepare the next turn. Try again."
        );
      }
    }
  }

  private async listen() {
    if (this.closed || this.busy) {
      return;
    }
    this.busy = true;
    this.stopRecognition();
    this.generation += 1;
    const { generation } = this;
    this.finalSegments.clear();
    const signal = AbortSignal.any([
      this.controller.signal,
      AbortSignal.timeout(20_000),
    ]);
    this.callbacks.onError("");
    this.publish({ phase: "preparing" });
    try {
      const { token } = await createTranscriptionSession(signal);
      if (this.closed || generation !== this.generation) {
        return;
      }
      const recognition = new PracticeTranscription({
        onTurn: () => {
          // Segment finality drives Guided progress.
        },
        onText: () => {
          // Only completed phrases become transcript messages.
        },
        onFailure: () => {
          if (generation === this.generation) {
            this.fail(
              "Speech recognition disconnected. Try again or skip this turn."
            );
          }
        },
        onSegment: (id, text, final) => {
          if (
            this.closed ||
            generation !== this.generation ||
            this.progress.phase !== "listening" ||
            this.muted ||
            this.finalSegments.has(id)
          ) {
            return;
          }
          const next = matchPhrase(this.words, text, this.progress.confirmed);
          if (final) {
            this.finalSegments.add(id);
            this.publish({ confirmed: next, preview: next });
          } else {
            this.publish({ preview: next });
          }
        },
      });
      this.recognition = recognition;
      await recognition.start(token, signal);
      if (this.closed || generation !== this.generation) {
        return;
      }
      this.busy = false;
      this.lastVoiceAt = Date.now();
      this.publish({ phase: "listening" });
      this.callbacks.onState("listening");
      this.audio.setMuted(this.muted);
      this.quietTimer = setInterval(() => {
        if (
          !this.muted &&
          this.progress.confirmed === this.words.length &&
          this.words.length > 0 &&
          Date.now() - this.lastVoiceAt >= 650
        ) {
          this.complete();
        }
      }, 100);
    } catch {
      if (!this.closed && generation === this.generation) {
        this.fail(
          "Couldn't connect speech recognition. Try again or skip this turn."
        );
      }
    }
  }

  private complete() {
    if (this.closed || this.busy || this.progress.phase !== "listening") {
      return;
    }
    this.busy = true;
    this.stopRecognition();
    this.publish({ phase: "complete", completed: this.progress.completed + 1 });
    this.append("user", this.progress.text);
    this.turn = undefined;
    this.nextSkipped = false;
    // A bounded success beat; close/retry invalidates this callback.
    const { generation } = this;
    setTimeout(() => {
      if (this.closed || generation !== this.generation) {
        return;
      }
      this.busy = false;
      void this.advance();
    }, 450);
  }

  retry() {
    if (this.closed || this.busy) {
      return;
    }
    this.publish({ confirmed: 0, preview: 0 });
    if (this.progress.text) {
      void this.listen();
    } else {
      void this.advance();
    }
  }

  skip() {
    if (this.closed || this.busy) {
      return;
    }
    this.generation += 1;
    this.stopRecognition();
    this.publish({ skipped: this.progress.skipped + 1 });
    this.turn = undefined;
    this.nextSkipped = true;
    void this.advance();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.audio.setMuted(muted || this.progress.phase !== "listening");
    this.lastVoiceAt = Date.now();
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
  finish() {
    this.close();
    this.callbacks.onState("ended");
  }
  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.generation += 1;
    this.controller.abort();
    this.operation?.abort();
    this.stopRecognition();
    this.audio.dispose();
  }
}
