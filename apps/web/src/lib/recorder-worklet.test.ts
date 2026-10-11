/* eslint-disable vitest/max-expects */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

interface RecorderProcessor {
  process: (inputs: Float32Array[][]) => boolean;
}

function createRecorder(sampleRate: number) {
  let Processor: (new () => RecorderProcessor) | undefined;
  const registrations: string[] = [];
  const chunks: Float32Array[] = [];
  runInNewContext(readFileSync("public/audio/recorder.worklet.js", "utf-8"), {
    sampleRate,
    AudioWorkletProcessor: class {
      port = {
        postMessage(samples: Float32Array, transfer: ArrayBuffer[]) {
          chunks.push(structuredClone(samples, { transfer }));
          expect(samples.byteLength).toBe(0);
        },
      };
    },
    registerProcessor(name: string, constructor: new () => RecorderProcessor) {
      registrations.push(name);
      Processor = constructor;
    },
  });
  expect(registrations).toStrictEqual(["practice-recorder"]);
  if (!Processor) {
    throw new Error("Recorder processor was not registered.");
  }
  return { recorder: new Processor(), chunks };
}

describe("continuous microphone recording", () => {
  it.each([44_100, 48_000])(
    "conserves ordered samples and the pending remainder at %i Hz",
    (sampleRate) => {
      const { recorder, chunks } = createRecorder(sampleRate);
      const chunkSize = sampleRate / 20;
      const samples = Float32Array.from(
        { length: chunkSize * 4 },
        (_, index) => (index - chunkSize * 2) / (chunkSize * 2)
      );
      const firstEnd = chunkSize * 3 + 73;
      for (let offset = 0; offset < firstEnd; offset += 128) {
        expect(
          recorder.process([
            [samples.slice(offset, Math.min(offset + 128, firstEnd))],
          ])
        ).toBeTruthy();
      }
      expect(chunks.map((chunk) => chunk.length)).toStrictEqual([
        chunkSize,
        chunkSize,
        chunkSize,
      ]);
      expect(
        Float32Array.from(chunks.flatMap((chunk) => [...chunk]))
      ).toStrictEqual(samples.slice(0, chunkSize * 3));
      expect(recorder.process([])).toBeTruthy();
      expect(recorder.process([[]])).toBeTruthy();
      expect(chunks).toHaveLength(3);
      for (let offset = firstEnd; offset < samples.length; offset += 128) {
        expect(
          recorder.process([
            [samples.slice(offset, Math.min(offset + 128, samples.length))],
          ])
        ).toBeTruthy();
      }
      expect(chunks.map((chunk) => chunk.length)).toStrictEqual([
        chunkSize,
        chunkSize,
        chunkSize,
        chunkSize,
      ]);
      expect(chunks.flatMap((chunk) => [...chunk])).toStrictEqual([...samples]);
    }
  );
});
