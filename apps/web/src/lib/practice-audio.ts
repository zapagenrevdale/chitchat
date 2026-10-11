export function encodePcm(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(index * 2, value * (value < 0 ? 32_768 : 32_767), true);
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export function decodePcm(data: string) {
  const bytes = Uint8Array.from(
    atob(data),
    (character) => character.codePointAt(0) ?? 0
  );
  if (bytes.length === 0 || bytes.length % 2 !== 0) {
    throw new Error("Invalid speech audio.");
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32_768;
  }
  return samples;
}

async function closeAudioContext(context: AudioContext) {
  try {
    await context.close();
  } catch {
    // A context may already be closed by browser audio-device cleanup.
  }
}

export interface PlaybackPosition {
  generation: number;
  consumedSamples: number;
  submittedSamples: number;
  sampleRate: number;
}

export class PracticeAudio {
  // Keep microphone capture at the device's native rate, independent of Gemini's output rate.
  private inputContext = new AudioContext({ latencyHint: "interactive" });
  private context = new AudioContext({
    sampleRate: 24_000,
    latencyHint: "interactive",
  });
  private analyser = this.context.createAnalyser();
  private inputAnalyser = this.inputContext.createAnalyser();
  private recording?: {
    source: MediaStreamAudioSourceNode;
    node: AudioWorkletNode;
    stream: MediaStream;
  };
  private playback?: AudioWorkletNode;
  private playing = false;
  private onDrained?: () => void;
  private playbackGeneration = 0;
  private consumedSamples = 0;
  private submittedSamples = 0;
  private disposed = false;
  private muted = false;
  private inputStopped = false;
  inputVolume = 0;

  private onPlaying: (playing: boolean) => void;
  private readonly onProgress?: (position: PlaybackPosition) => void;

  constructor(
    onPlaying: (playing: boolean) => void,
    onProgress?: (position: PlaybackPosition) => void
  ) {
    this.onPlaying = onPlaying;
    this.onProgress = onProgress;
    this.analyser.fftSize = 256;
    this.inputAnalyser.fftSize = 256;
    this.analyser.connect(this.context.destination);
  }

  async prepare(
    signal: AbortSignal,
    onAudio: (data: string, sampleRate: number) => void,
    onFailure: (message: string) => void
  ) {
    signal.throwIfAborted();
    await Promise.all([this.inputContext.resume(), this.context.resume()]);
    signal.throwIfAborted();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    try {
      signal.throwIfAborted();
      await this.initializePlayback(onFailure);
      await this.inputContext.audioWorklet.addModule(
        "/audio/recorder.worklet.js"
      );
      signal.throwIfAborted();
      const source = this.inputContext.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(this.inputContext, "practice-recorder");
      this.recording = { source, node, stream };
      for (const track of stream.getTracks()) {
        track.addEventListener(
          "ended",
          () =>
            onFailure(
              "The microphone disconnected. Reconnect it and start again."
            ),
          { once: true }
        );
      }
      node.addEventListener(
        "processorerror",
        () => onFailure("Microphone audio stopped. Please start again."),
        { once: true }
      );
      node.port.addEventListener(
        "message",
        (event: MessageEvent<Float32Array>) => {
          if (this.disposed || this.muted) {
            return;
          }
          this.inputVolume = Math.min(
            1,
            Math.sqrt(
              event.data.reduce((sum, value) => sum + value * value, 0) /
                event.data.length
            ) * 4
          );
          // Gemini accepts the browser's native rate and resamples it server-side.
          onAudio(encodePcm(event.data), this.inputContext.sampleRate);
        }
      );
      node.port.start();
      source.connect(node);
      source.connect(this.inputAnalyser);
      // Worklet output is silent; connecting keeps capture running without microphone feedback.
      node.connect(this.inputContext.destination);
    } catch (error) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      throw error;
    }
  }

  setMuted(muted: boolean) {
    if (this.inputStopped) {
      return;
    }
    this.muted = muted;
    this.inputVolume = 0;
    for (const track of this.recording?.stream.getTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  stopInput() {
    if (this.inputStopped) {
      return;
    }
    this.inputStopped = true;
    this.muted = true;
    this.inputVolume = 0;
    this.recording?.node.port.close();
    this.recording?.source.disconnect();
    this.recording?.node.disconnect();
    for (const track of this.recording?.stream.getTracks() ?? []) {
      track.stop();
    }
    this.recording = undefined;
    void closeAudioContext(this.inputContext);
  }

  async prepareOutput(onFailure: (message: string) => void) {
    await this.context.resume();
    if (this.context.state !== "running") {
      throw new Error("Audio playback is blocked.");
    }
    await this.initializePlayback(onFailure);
  }

  private async initializePlayback(onFailure: (message: string) => void) {
    await this.context.audioWorklet.addModule("/audio/playback.worklet.js");
    if (this.disposed) {
      return;
    }
    const playback = new AudioWorkletNode(this.context, "practice-speaker", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.playback = playback;
    playback.port.addEventListener(
      "message",
      (
        event: MessageEvent<{
          generation: number;
          type: string;
          playing: boolean;
          message: string;
          consumedSamples: number;
        }>
      ) => {
        if (
          this.disposed ||
          event.data.generation !== this.playbackGeneration
        ) {
          return;
        }
        if (event.data.type === "playing") {
          this.playing = event.data.playing;
          this.onPlaying(this.playing);
        } else if (event.data.type === "progress") {
          const { consumedSamples } = event.data;
          if (
            Number.isSafeInteger(consumedSamples) &&
            consumedSamples >= this.consumedSamples &&
            consumedSamples <= this.submittedSamples
          ) {
            this.consumedSamples = consumedSamples;
            this.onProgress?.(this.getPlaybackPosition());
          }
        } else if (event.data.type === "drained") {
          const { onDrained } = this;
          this.onDrained = undefined;
          onDrained?.();
        } else if (event.data.type === "error") {
          onFailure(event.data.message);
        }
      }
    );
    playback.port.start();
    playback.addEventListener(
      "processorerror",
      () => onFailure("Speech playback stopped. Please start again."),
      { once: true }
    );
    playback.connect(this.analyser);
  }

  play(data: string, mimeType: string) {
    if (this.disposed) {
      return;
    }
    const rate = /rate=(?<rate>\d+)/u.exec(mimeType)?.groups?.rate;
    if (
      !mimeType.toLowerCase().startsWith("audio/pcm") ||
      Number(rate) !== 24_000
    ) {
      throw new Error("Unsupported speech audio.");
    }
    if (!this.playback) {
      throw new Error("Speech playback is not ready.");
    }
    const samples = decodePcm(data);
    this.submittedSamples += samples.length;
    // MessagePort has no targetOrigin parameter.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    this.playback.port.postMessage(
      { type: "audio", generation: this.playbackGeneration, samples },
      [samples.buffer]
    );
  }

  drainPlayback(onDrained: () => void) {
    if (!this.playback || this.disposed) {
      onDrained();
      return;
    }
    this.onDrained = onDrained;
    const message = { type: "drain", generation: this.playbackGeneration };
    // MessagePort has no targetOrigin parameter.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    this.playback.port.postMessage(message);
  }

  finishPlayback() {
    const message = { type: "finish", generation: this.playbackGeneration };
    // MessagePort has no targetOrigin parameter.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    this.playback?.port.postMessage(message);
  }

  stopPlayback() {
    this.playbackGeneration += 1;
    this.onDrained = undefined;
    this.consumedSamples = 0;
    this.submittedSamples = 0;
    const message = { type: "clear", generation: this.playbackGeneration };
    // MessagePort has no targetOrigin parameter.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    this.playback?.port.postMessage(message);
    this.playing = false;
    this.onPlaying(false);
  }

  getPlaybackPosition(): PlaybackPosition {
    return {
      generation: this.playbackGeneration,
      consumedSamples: this.consumedSamples,
      submittedSamples: this.submittedSamples,
      sampleRate: this.context.sampleRate,
    };
  }

  getOutputVolume() {
    if (this.disposed || !this.playing) {
      return 0;
    }
    const values = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(values);
    return Math.min(
      1,
      Math.sqrt(
        values.reduce((sum, value) => sum + value * value, 0) / values.length
      ) * 4
    );
  }

  getAnalyser() {
    return this.playing ? this.analyser : this.inputAnalyser;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopInput();
    this.stopPlayback();
    this.playback?.port.close();
    this.playback?.disconnect();
    this.playback = undefined;
    this.analyser.disconnect();
    this.inputAnalyser.disconnect();
    void closeAudioContext(this.context);
  }
}
