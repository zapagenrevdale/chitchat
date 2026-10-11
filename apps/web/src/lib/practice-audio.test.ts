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

function createCancellationFixture() {
  const inputResume = Promise.withResolvers<null>();
  const outputResume = Promise.withResolvers<null>();
  const acquisitionStarted = Promise.withResolvers<null>();
  const tracks = [{ stop: vi.fn<() => void>() }, { stop: vi.fn<() => void>() }];
  const stream = { getTracks: () => tracks };
  const acquisition = Promise.withResolvers<typeof stream>();
  const resume = vi
    .fn<() => Promise<null>>()
    .mockReturnValueOnce(inputResume.promise)
    .mockReturnValueOnce(outputResume.promise);
  const addModule = vi.fn<() => Promise<void>>().mockResolvedValue();
  const worklet = vi.fn<() => void>();
  const getUserMedia = vi.fn<() => Promise<typeof stream>>(() => {
    acquisitionStarted.resolve(null);
    return acquisition.promise;
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      destination = {};
      audioWorklet = { addModule };
      resume = resume;
      close = vi.fn<() => Promise<void>>().mockResolvedValue();
      createAnalyser = createAnalyser;
    }
  );
  vi.stubGlobal("AudioWorkletNode", worklet);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return {
    audio: new PracticeAudio(vi.fn<(playing: boolean) => void>()),
    inputResume,
    outputResume,
    acquisition,
    acquisitionStarted,
    stream,
    tracks,
    resume,
    addModule,
    worklet,
    getUserMedia,
  };
}

describe("audio startup cancellation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an already-aborted startup without resuming audio or requesting the microphone", async () => {
    const fixture = createCancellationFixture();
    const controller = new AbortController();
    controller.abort();
    fixture.inputResume.resolve(null);
    fixture.outputResume.resolve(null);
    fixture.acquisition.resolve(fixture.stream);
    try {
      await expect(
        fixture.audio.prepare(controller.signal, vi.fn(), vi.fn())
      ).rejects.toBe(controller.signal.reason);
      expect(fixture.getUserMedia).not.toHaveBeenCalled();
      expect(fixture.resume).not.toHaveBeenCalled();
      expect(fixture.addModule).not.toHaveBeenCalled();
      expect(fixture.worklet).not.toHaveBeenCalled();
    } finally {
      fixture.audio.dispose();
    }
  });

  it.each(["input", "output"])(
    "does not request the microphone after cancellation while %s audio resumes",
    async (pendingContext) => {
      const fixture = createCancellationFixture();
      const controller = new AbortController();
      const pendingResume =
        pendingContext === "input" ? fixture.inputResume : fixture.outputResume;
      const otherResume =
        pendingContext === "input" ? fixture.outputResume : fixture.inputResume;
      otherResume.resolve(null);
      fixture.acquisition.resolve(fixture.stream);
      try {
        const preparation = fixture.audio.prepare(
          controller.signal,
          vi.fn(),
          vi.fn()
        );
        controller.abort();
        pendingResume.resolve(null);
        await expect(preparation).rejects.toBe(controller.signal.reason);
        expect(fixture.getUserMedia).not.toHaveBeenCalled();
        expect(fixture.addModule).not.toHaveBeenCalled();
        expect(fixture.worklet).not.toHaveBeenCalled();
      } finally {
        fixture.audio.dispose();
      }
    }
  );

  it("stops every acquired track without starting worklets when canceled during microphone acquisition", async () => {
    const fixture = createCancellationFixture();
    const controller = new AbortController();
    fixture.inputResume.resolve(null);
    fixture.outputResume.resolve(null);
    try {
      const preparation = fixture.audio.prepare(
        controller.signal,
        vi.fn(),
        vi.fn()
      );
      await fixture.acquisitionStarted.promise;
      controller.abort();
      fixture.acquisition.resolve(fixture.stream);
      await expect(preparation).rejects.toBe(controller.signal.reason);
      for (const track of fixture.tracks) {
        expect(track.stop).toHaveBeenCalledOnce();
      }
      expect(fixture.addModule).not.toHaveBeenCalled();
      expect(fixture.worklet).not.toHaveBeenCalled();
    } finally {
      fixture.audio.dispose();
    }
  });
});

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

function createOutputFixture() {
  const port = Object.assign(new EventTarget(), {
    start: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    postMessage: vi.fn<(message: object) => void>(),
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 24_000;
      state = "running";
      destination = {};
      audioWorklet = {
        addModule: vi.fn<() => Promise<void>>().mockResolvedValue(),
      };
      resume = vi.fn<() => Promise<void>>().mockResolvedValue();
      close = vi.fn<() => Promise<void>>().mockResolvedValue();
      createAnalyser = createAnalyser;
    }
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class extends EventTarget {
      port = port;
      connect = vi.fn<() => void>();
      disconnect = vi.fn<() => void>();
    }
  );
  const onProgress =
    vi.fn<NonNullable<ConstructorParameters<typeof PracticeAudio>[1]>>();
  return {
    audio: new PracticeAudio(vi.fn<(playing: boolean) => void>(), onProgress),
    onProgress,
    notify: (data: object) =>
      port.dispatchEvent(new MessageEvent("message", { data })),
  };
}

describe("consumed PCM positions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports monotonic consumed positions bounded by submitted samples", async () => {
    const { audio, notify, onProgress } = createOutputFixture();
    try {
      await audio.prepareOutput(vi.fn());
      audio.play(encodePcm(new Float32Array(3)), "audio/pcm;rate=24000");
      expect(audio.getPlaybackPosition()).toStrictEqual({
        generation: 0,
        consumedSamples: 0,
        submittedSamples: 3,
        sampleRate: 24_000,
      });
      notify({ type: "progress", generation: 0, consumedSamples: 2 });
      expect(onProgress).toHaveBeenLastCalledWith({
        generation: 0,
        consumedSamples: 2,
        submittedSamples: 3,
        sampleRate: 24_000,
      });
      for (const consumedSamples of [1, 4, -1, 1.5, Number.NaN]) {
        notify({ type: "progress", generation: 0, consumedSamples });
      }
      expect(onProgress).toHaveBeenCalledOnce();
      expect(audio.getPlaybackPosition().consumedSamples).toBe(2);
    } finally {
      audio.dispose();
    }
  });

  it("resets counters, filters stale generations, and cancels old drain callbacks", async () => {
    const { audio, notify, onProgress } = createOutputFixture();
    try {
      await audio.prepareOutput(vi.fn());
      audio.play(encodePcm(new Float32Array(3)), "audio/pcm;rate=24000");
      const oldDrain = vi.fn<() => void>();
      audio.drainPlayback(oldDrain);
      notify({ type: "progress", generation: 0, consumedSamples: 2 });
      audio.stopPlayback();
      expect(audio.getPlaybackPosition()).toStrictEqual({
        generation: 1,
        consumedSamples: 0,
        submittedSamples: 0,
        sampleRate: 24_000,
      });
      notify({ type: "progress", generation: 0, consumedSamples: 3 });
      notify({ type: "drained", generation: 0 });
      notify({ type: "drained", generation: 1 });
      expect({
        progress: onProgress.mock.calls.length,
        drains: oldDrain.mock.calls.length,
      }).toStrictEqual({ progress: 1, drains: 0 });
      audio.play(encodePcm(new Float32Array(3)), "audio/pcm;rate=24000");
      const newDrain = vi.fn<() => void>();
      audio.drainPlayback(newDrain);
      notify({ type: "progress", generation: 1, consumedSamples: 3 });
      notify({ type: "drained", generation: 1 });
      expect(onProgress).toHaveBeenLastCalledWith({
        generation: 1,
        consumedSamples: 3,
        submittedSamples: 3,
        sampleRate: 24_000,
      });
      expect(newDrain).toHaveBeenCalledOnce();
    } finally {
      audio.dispose();
    }
  });
});
