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
        postMessage: notifications,
      };
    },
    registerProcessor(_name: string, constructor: new () => PlaybackProcessor) {
      Processor = constructor;
    },
  });
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
