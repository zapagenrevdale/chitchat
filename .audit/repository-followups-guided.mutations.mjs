import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const recorderSource = readFileSync("apps/web/public/audio/recorder.worklet.js", "utf8");
const playbackSource = readFileSync("apps/web/public/audio/playback.worklet.js", "utf8");
function check(source, expectedName, rate, record) {
  let Constructor;
  const names = [];
  const chunks = [];
  runInNewContext(source, {
    sampleRate: rate,
    AudioWorkletProcessor: class {
      port = {
        postMessage(samples, transfer) { chunks.push(structuredClone(samples, { transfer })); },
        addEventListener() {},
        start() {},
      };
    },
    registerProcessor(name, processor) { names.push(name); Constructor = processor; },
  });
  assert.deepEqual(names, [expectedName]);
  if (!record) return;
  const processor = new Constructor();
  const input = Float32Array.from({ length: rate / 20 * 4 }, (_, index) => index / rate);
  const split = rate / 20 * 3 + 73;
  for (const [start, end] of [[0, split], [split, input.length]]) {
    for (let offset = start; offset < end; offset += 128) {
      processor.process([[input.slice(offset, Math.min(offset + 128, end))]]);
    }
  }
  assert.deepEqual(chunks.flatMap(chunk => [...chunk]), [...input]);
}
for (const rate of [44_100, 48_000]) {
  check(recorderSource, "practice-recorder", rate, true);
  assert.throws(() => check(recorderSource.replace('registerProcessor("practice-recorder"', 'registerProcessor("wrong"'), "practice-recorder", rate, true), assert.AssertionError);
  assert.throws(() => check(recorderSource.replace("for (const sample of channel)", "for (const sample of channel.subarray(1))"), "practice-recorder", rate, true), assert.AssertionError);
  console.log(`${rate} Hz baseline passes; wrong registration and dropped block samples rejected.`);
}
check(playbackSource, "practice-speaker", 24_000, false);
assert.throws(() => check(playbackSource.replace('registerProcessor("practice-speaker"', 'registerProcessor("wrong"'), "practice-speaker", 24_000, false), assert.AssertionError);
console.log("Playback baseline registration passes; wrong registration rejected.");
