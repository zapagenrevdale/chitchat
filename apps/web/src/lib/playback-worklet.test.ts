import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

interface PlaybackProcessor {
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}
function createPlayer() {
  let Processor: (new () => PlaybackProcessor) | undefined;
  let receive: ((event: { data: object }) => void) | undefined;
  const notifications = vi.fn<(message: object) => void>();
  const registrations: string[] = [];
  runInNewContext(readFileSync("public/audio/playback.worklet.js", "utf-8"), {
    sampleRate: 24_000,
    AudioWorkletProcessor: class {
      port = {
        addEventListener(
          _type: string,
          handler: (event: { data: object }) => void
        ) {
          receive = handler;
        },
        start() {
          /* The test delivers messages synchronously. */
        },
        postMessage(message: object) {
          notifications({ ...message });
        },
      };
    },
    registerProcessor(name: string, constructor: new () => PlaybackProcessor) {
      registrations.push(name);
      Processor = constructor;
    },
  });
  expect(registrations).toStrictEqual(["practice-speaker"]);
  if (!Processor) {
    throw new Error("Playback processor was not registered.");
  }
  const player = new Processor();
  return {
    send(data: object) {
      if (!receive) {
        throw new Error("Missing message handler.");
      }
      receive({ data });
    },
    render(blocks: number) {
      const rendered = new Float32Array(blocks * 128);
      for (let index = 0; index < blocks; index += 1) {
        const block = rendered.subarray(index * 128, (index + 1) * 128);
        player.process([], [[block]]);
      }
      return rendered;
    },
    notifications,
  };
}

describe("continuous speech playback", () => {
  it("reports copied silent PCM, not startup buffering, underrun silence, or fades", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(100),
    });
    player.render(10);
    expect(player.notifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress" })
    );
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(2200),
    });
    player.render(30);
    const progress = player.notifications.mock.calls
      .map(([message]) => message)
      .filter((message) => "type" in message && message.type === "progress");
    expect(progress).toStrictEqual([
      { type: "progress", generation: 0, consumedSamples: 768 },
      { type: "progress", generation: 0, consumedSamples: 1536 },
      { type: "progress", generation: 0, consumedSamples: 2300 },
    ]);
    player.send({ type: "drain", generation: 0 });
    player.render(1);
    expect(player.notifications.mock.calls.slice(-2)).toStrictEqual([
      [{ type: "progress", generation: 0, consumedSamples: 2300 }],
      [{ type: "drained", generation: 0 }],
    ]);
    player.render(20);
    expect(player.notifications.mock.calls.at(-2)).toStrictEqual([
      { type: "progress", generation: 0, consumedSamples: 2300 },
    ]);
  });

  it("resets progress and cancels an old drain on generation clear", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(2400).fill(0.5),
    });
    player.send({ type: "drain", generation: 0 });
    player.render(6);
    player.send({ type: "clear", generation: 1 });
    player.render(20);
    expect(player.notifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "drained" })
    );
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(2400),
    });
    player.send({ type: "drain", generation: 0 });
    player.send({
      type: "audio",
      generation: 1,
      samples: new Float32Array(10),
    });
    player.send({ type: "drain", generation: 1 });
    player.render(2);
    expect(player.notifications.mock.calls.slice(-2)).toStrictEqual([
      [{ type: "progress", generation: 1, consumedSamples: 10 }],
      [{ type: "drained", generation: 1 }],
    ]);
  });

  it("reports short finished speech before announcing playback stopped without a drain", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(128).fill(0.5),
    });
    player.send({ type: "finish", generation: 0 });
    player.render(100);
    expect(player.notifications.mock.calls.slice(-2)).toStrictEqual([
      [{ type: "progress", generation: 0, consumedSamples: 128 }],
      [{ type: "playing", generation: 0, playing: false }],
    ]);
  });

  it("flushes residual consumption on underrun and keeps silence out of progress", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(2400).fill(0.5),
    });
    player.render(100);
    const progress = player.notifications.mock.calls
      .map(([message]) => message)
      .filter((message) => "type" in message && message.type === "progress");
    expect(progress).toStrictEqual([
      { type: "progress", generation: 0, consumedSamples: 768 },
      { type: "progress", generation: 0, consumedSamples: 1536 },
      { type: "progress", generation: 0, consumedSamples: 2304 },
      { type: "progress", generation: 0, consumedSamples: 2400 },
    ]);
  });

  it("preserves every sample across uneven chunks without introducing tones at boundaries", () => {
    const player = createPlayer();
    const speech = Float32Array.from(
      { length: 8192 },
      (_, index) => Math.sin(index * 0.053) * 0.4
    );
    for (const [start, end] of [
      [0, 1],
      [1, 2415],
      [2415, 6255],
      [6255, 8192],
    ]) {
      player.send({
        type: "audio",
        generation: 0,
        samples: speech.slice(start, end),
      });
    }
    player.send({ type: "finish", generation: 0 });
    expect(player.render(64)).toStrictEqual(speech);
  });

  it("buffers tiny initial chunks and drains short final replies", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array([0.25]),
    });
    expect(player.render(1)).toStrictEqual(new Float32Array(128));
    player.send({ type: "finish", generation: 0 });
    expect(player.render(1)[0]).toBe(0.25);
  });

  it("clears interrupted speech and cannot replay old samples in the next turn", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(2400).fill(0.5),
    });
    player.render(1);
    player.send({ type: "clear", generation: 1 });
    const fade = player.render(1);
    expect(fade[0]).toBeLessThan(0.5);
    expect(fade[127]).toBe(0);
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(2400).fill(0.9),
    });
    player.send({
      type: "audio",
      generation: 1,
      samples: new Float32Array(2400).fill(0.1),
    });
    expect([...player.render(1)]).toStrictEqual([
      ...new Float32Array(128).fill(0.1),
    ]);
  });

  it("acknowledges drain only after queued speech and its fade have played", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(256).fill(0.5),
    });
    player.send({ type: "drain", generation: 0 });
    player.render(1);
    expect(player.notifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "drained" })
    );
    player.render(3);
    expect(player.notifications).toHaveBeenLastCalledWith({
      type: "drained",
      generation: 0,
    });
  });

  it("acknowledges drain even when there is no final spoken reply", () => {
    const player = createPlayer();
    player.send({ type: "drain", generation: 0 });
    player.render(1);
    expect(player.notifications).toHaveBeenCalledWith({
      type: "drained",
      generation: 0,
    });
  });

  it("bounds the audio backlog", () => {
    const player = createPlayer();
    player.send({
      type: "audio",
      generation: 0,
      samples: new Float32Array(24_000 * 31),
    });
    expect(player.notifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    );
    expect(player.render(1)).toStrictEqual(new Float32Array(128));
  });
});
