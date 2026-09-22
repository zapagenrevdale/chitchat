import { practiceTranscriptionEventSchema } from "@chitchat/contracts";

interface Callbacks {
  onTurn: (itemId: string) => void;
  onText: (itemId: string, text: string) => void;
  onFailure: () => void;
  onSegment?: (itemId: string, text: string, final: boolean) => void;
}

// Receives the same PCM chunks as the conversation; never opens a second mic.
export class PracticeTranscription {
  private socket?: WebSocket;
  private ready = false;
  private closed = false;
  private finishing = false;
  private nextId = 0;
  private currentId?: string;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private resolveFinish?: () => void;
  private controller = new AbortController();
  private callbacks: Callbacks;

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }

  async start(token: string, signal: AbortSignal) {
    const startupSignal = AbortSignal.any([
      signal,
      this.controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const opening = Promise.withResolvers<undefined>();
    const url = new URL(
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained"
    );
    url.searchParams.set("access_token", token);
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      if (!this.closed) {
        socket.send(
          JSON.stringify({
            setup: { model: "models/gemini-3.5-transcribe-live" },
          })
        );
      }
    });
    socket.addEventListener(
      "message",
      (event: MessageEvent<string | ArrayBuffer>) => {
        if (this.closed) {
          return;
        }
        try {
          const raw =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data);
          const parsed = practiceTranscriptionEventSchema.safeParse(
            JSON.parse(raw)
          );
          if (!parsed.success) {
            return;
          }
          if (parsed.data.setupComplete) {
            this.ready = true;
            opening.resolve();
          }
          if (parsed.data.error || parsed.data.goAway) {
            this.fail();
            return;
          }
          const content = parsed.data.serverContent;
          if (content?.interimInputTranscription?.text !== undefined) {
            this.caption(content.interimInputTranscription.text, false);
          }
          if (content?.inputTranscription?.text !== undefined) {
            this.caption(content.inputTranscription.text, true);
          }
        } catch {
          this.fail();
        }
      }
    );
    socket.addEventListener("error", () => this.fail());
    socket.addEventListener("close", () => this.fail());
    const aborted = () => opening.reject(startupSignal.reason);
    startupSignal.addEventListener("abort", aborted, { once: true });
    if (startupSignal.aborted) {
      aborted();
    }
    try {
      await opening.promise;
    } catch (error) {
      this.close();
      throw error;
    } finally {
      startupSignal.removeEventListener("abort", aborted);
    }
  }

  private caption(text: string, final: boolean) {
    if (!this.currentId && !text.trim()) {
      return;
    }
    if (!this.currentId) {
      this.nextId += 1;
      this.currentId = String(this.nextId);
      this.callbacks.onTurn(this.currentId);
    }
    // Gemini interim hypotheses replace one another. inputTranscription is
    // authoritative text for the segment, not another delta to append.
    this.callbacks.onText(this.currentId, text);
    this.callbacks.onSegment?.(this.currentId, text, final);
    if (final) {
      this.currentId = undefined;
    }
  }

  sendAudio(data: string, sampleRate: number) {
    if (!this.finishing) {
      this.send({ audio: { data, mimeType: `audio/pcm;rate=${sampleRate}` } });
    }
  }

  endAudio() {
    this.send({ audioStreamEnd: true });
  }

  private send(realtimeInput: object) {
    if (this.closed || !this.ready) {
      return;
    }
    const { socket } = this;
    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      socket.bufferedAmount > 256_000
    ) {
      this.fail();
      return;
    }
    try {
      socket.send(JSON.stringify({ realtimeInput }));
    } catch {
      this.fail();
    }
  }

  finish(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    this.finishing = true;
    const completion = Promise.withResolvers<undefined>();
    this.resolveFinish = () => completion.resolve();
    // A final segment isn't an acknowledgement of audioStreamEnd. Keep reading
    // briefly so an earlier finalized segment cannot truncate the last words.
    this.finishTimer = setTimeout(() => this.close(), 3000);
    this.endAudio();
    return completion.promise;
  }

  private fail() {
    if (this.closed) {
      return;
    }
    this.close();
    this.callbacks.onFailure();
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.controller.abort();
    clearTimeout(this.finishTimer);
    this.socket?.close();
    this.resolveFinish?.();
  }
}
