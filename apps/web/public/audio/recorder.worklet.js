/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Send 50 ms chunks continuously. Output stays silent to avoid microphone feedback.
class PracticeRecorder extends AudioWorkletProcessor {
  buffer = new Float32Array(Math.round(sampleRate / 20));
  offset = 0;

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }
    for (const sample of channel) {
      this.buffer[this.offset] = sample;
      this.offset += 1;
      if (this.offset === this.buffer.length) {
        // MessagePort has no targetOrigin parameter.
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(Math.round(sampleRate / 20));
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("practice-recorder", PracticeRecorder);
