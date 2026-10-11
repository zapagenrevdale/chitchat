/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// One continuous stream avoids restarting the browser's resampler for every network chunk.
class PracticeSpeaker extends AudioWorkletProcessor {
  chunks = [];
  offset = 0;
  queued = 0;
  generation = 0;
  consumedSamples = 0;
  reportedSamples = 0;
  progressSamples = Math.round(sampleRate * 0.032);
  complete = false;
  draining = false;
  playing = false;
  lastSample = 0;
  fadeSample = 0;
  fadeRemaining = 0;
  bufferSamples = Math.round(sampleRate * 0.08);
  fadeSamples = Math.round(sampleRate * 0.005);

  constructor() {
    super();
    this.port.addEventListener("message", ({ data }) => this.receive(data));
    this.port.start();
  }

  notify(message) {
    // MessagePort has no targetOrigin parameter.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    this.port.postMessage({ ...message, generation: this.generation });
  }

  receive(message) {
    if (message.type === "clear") {
      this.generation = message.generation;
      this.clear();
      return;
    }
    if (message.generation !== this.generation) {
      return;
    }
    if (message.type === "drain") {
      this.complete = true;
      this.draining = true;
    } else if (message.type === "finish") {
      this.complete = true;
    } else if (message.type === "audio") {
      if (this.queued + message.samples.length > sampleRate * 30) {
        this.clear();
        this.notify({
          type: "error",
          message: "Speech playback fell behind. Please start again.",
        });
        return;
      }
      if (message.samples.length > 0) {
        this.chunks.push(message.samples);
        this.queued += message.samples.length;
        this.complete = false;
      }
    }
  }

  clear() {
    this.chunks = [];
    this.queued = 0;
    this.offset = 0;
    this.complete = false;
    this.draining = false;
    this.consumedSamples = 0;
    this.reportedSamples = 0;
    this.beginFade();
    this.setPlaying(false);
  }

  setPlaying(playing) {
    if (this.playing !== playing) {
      if (!playing && this.consumedSamples !== this.reportedSamples) {
        this.reportProgress();
      }
      this.playing = playing;
      this.notify({ type: "playing", playing });
    }
  }

  beginFade() {
    this.fadeSample = this.lastSample;
    this.fadeRemaining = this.fadeSamples;
    this.lastSample = 0;
  }

  quietSample() {
    if (this.fadeRemaining === 0) {
      return 0;
    }
    this.fadeRemaining -= 1;
    return (this.fadeSample * this.fadeRemaining) / this.fadeSamples;
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) {
      return true;
    }
    if (
      !this.playing &&
      (this.queued >= this.bufferSamples || (this.complete && this.queued > 0))
    ) {
      this.fadeRemaining = 0;
      this.setPlaying(true);
    }
    for (let index = 0; index < output.length; index += 1) {
      if (!this.playing) {
        output[index] = this.quietSample();
        continue;
      }
      const [chunk] = this.chunks;
      if (!chunk) {
        this.beginFade();
        this.setPlaying(false);
        output[index] = this.quietSample();
        continue;
      }
      output[index] = chunk[this.offset];
      this.lastSample = output[index];
      this.offset += 1;
      this.queued -= 1;
      this.consumedSamples += 1;
      if (this.offset === chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    if (this.consumedSamples - this.reportedSamples >= this.progressSamples) {
      this.reportProgress();
    }
    if (
      this.draining &&
      !this.playing &&
      this.queued === 0 &&
      this.fadeRemaining === 0
    ) {
      this.draining = false;
      this.reportProgress();
      this.notify({ type: "drained" });
    }
    return true;
  }

  reportProgress() {
    this.reportedSamples = this.consumedSamples;
    this.notify({ type: "progress", consumedSamples: this.consumedSamples });
  }
}
registerProcessor("practice-speaker", PracticeSpeaker);
