// Context and worklet doubles share the same audio lifecycle fixture.
/* oxlint-disable max-classes-per-file */
import { afterEach, describe, expect, it, vi } from "vitest";

import { decodePcm, encodePcm, PracticeAudio } from "./practice-audio";

function createNode() {
  return { connect: vi.fn<() => void>(), disconnect: vi.fn<() => void>() };
}

function createAnalyser() {
  return { ...createNode(), fftSize: 256 };
}

describe("streaming PCM audio", () => {
  it("encodes signed little-endian samples without a WAV header", () => {
    const data = encodePcm(new Float32Array([-2, -0.5, 0, 0.5, 2]));
    const bytes = Buffer.from(data, "base64");
    expect(bytes).toHaveLength(10);
    expect(
      [0, 2, 4, 6, 8].map((offset) => bytes.readInt16LE(offset))
    ).toStrictEqual([-32_768, -16_384, 0, 16_383, 32_767]);
    const decoded = decodePcm(data);
    expect(decoded[0]).toBe(-1);
    expect(decoded[1]).toBe(-0.5);
    expect(decoded[4]).toBeCloseTo(1, 4);
  });

  it("rejects partial samples", () => {
    expect(() => decodePcm("AA==")).toThrow("Invalid speech audio");
  });
});

describe("microphone capture during speech playback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves native-rate microphone audio through playback, interruption, and cleanup", async () => {
    const contexts: { sampleRate: number; close: ReturnType<typeof vi.fn> }[] =
      [];
    const ports = new Map<string, EventTarget>();
    const workletRates = new Map<string, number>();
    const track = Object.assign(new EventTarget(), {
      enabled: true,
      stop: vi.fn<() => void>(),
    });
    const stream = { getTracks: () => [track] };
    vi.stubGlobal(
      "AudioContext",
      class {
        sampleRate: number;
        destination = {};
        audioWorklet = {
          addModule: vi
            .fn<(path: string) => Promise<void>>()
            .mockResolvedValue(),
        };
        resume = vi.fn<() => Promise<void>>().mockResolvedValue();
        close = vi.fn<() => Promise<void>>().mockResolvedValue();
        createAnalyser = createAnalyser;
        createMediaStreamSource = createNode;
        constructor(options?: AudioContextOptions) {
          this.sampleRate = options?.sampleRate ?? 48_000;
          contexts.push(this);
        }
      }
    );
    vi.stubGlobal(
      "AudioWorkletNode",
      class extends EventTarget {
        connect = vi.fn<() => void>();
        disconnect = vi.fn<() => void>();
        port = Object.assign(new EventTarget(), {
          start: vi.fn<() => void>(),
          close: vi.fn<() => void>(),
          postMessage: vi.fn<(message: object) => void>(),
        });
        constructor(context: AudioContext, name: string) {
          super();
          ports.set(name, this.port);
          workletRates.set(name, context.sampleRate);
        }
      }
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi
          .fn<() => Promise<typeof stream>>()
          .mockResolvedValue(stream),
      },
    });
    const onAudio = vi.fn<(data: string, rate: number) => void>();
    const audio = new PracticeAudio(vi.fn<(playing: boolean) => void>());
    const samples = new Float32Array([0.25, -0.5, 0.125]);
    const capture = () =>
      ports
        .get("practice-recorder")
        ?.dispatchEvent(new MessageEvent("message", { data: samples }));
    try {
      await audio.prepare(
        new AbortController().signal,
        onAudio,
        vi.fn<(message: string) => void>()
      );
      expect(Object.fromEntries(workletRates)).toStrictEqual({
        "practice-speaker": 24_000,
        "practice-recorder": 48_000,
      });
      capture();
      audio.play(encodePcm(samples), "audio/pcm;rate=24000");
      capture();
      audio.stopPlayback();
      capture();
      expect(onAudio).toHaveBeenCalledTimes(3);
      for (const [data, rate] of onAudio.mock.calls) {
        expect(data).toBe(encodePcm(samples));
        expect(rate).toBe(48_000);
      }
      expect(track.enabled).toBeTruthy();
      audio.setMuted(true);
      capture();
      expect(onAudio).toHaveBeenCalledTimes(3);
      audio.setMuted(false);
      capture();
      audio.stopInput();
      audio.setMuted(false);
      capture();
      expect([
        onAudio.mock.calls.length,
        contexts[0]?.close.mock.calls.length,
        contexts[1]?.close.mock.calls.length,
      ]).toStrictEqual([4, 1, 0]);
      audio.play(encodePcm(samples), "audio/pcm;rate=24000");
    } finally {
      audio.dispose();
    }
    expect(track.stop).toHaveBeenCalledOnce();
    expect(contexts).toHaveLength(2);
    for (const context of contexts) {
      expect(context.close).toHaveBeenCalledOnce();
    }
  });
});
