import { cleanup, render } from "@testing-library/react";
import type { MotionValue } from "motion/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ChitAvatar } from "./chit-avatar";

const meter = vi.hoisted(() => ({
  set: vi.fn(),
  jump: vi.fn(),
  reduced: false,
}));
vi.mock(import("motion/react"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useReducedMotion: () => meter.reduced,
    useSpring: <T extends number | string>(initial: T | MotionValue<T>) => {
      const value = actual.useMotionValue(
        typeof initial === "object" ? initial.get() : initial
      );
      value.set = meter.set;
      value.jump = meter.jump;
      return value;
    },
  };
});

let nextFrame: FrameRequestCallback;
const cancelFrame = vi.fn();

beforeEach(() => {
  meter.reduced = false;
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 42;
  });
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function analyser(amplitude: number) {
  return {
    fftSize: 32,
    getFloatTimeDomainData: (samples: Float32Array) => {
      samples.fill(amplitude);
    },
  } as AnalyserNode;
}

it("follows loudness and resolves source changes without a render", () => {
  let source: AnalyserNode | null = analyser(0.1);
  const view = render(
    <ChitAvatar state="speaking" getAnalyser={() => source} />
  );
  expect(meter.set.mock.lastCall?.[0]).toBeCloseTo(0.36);
  source = analyser(0.3);
  nextFrame(16);
  expect(meter.set).toHaveBeenLastCalledWith(1);
  source = analyser(0);
  nextFrame(32);
  expect(meter.set).toHaveBeenLastCalledWith(0);
  source = null;
  nextFrame(48);
  expect(meter.set).toHaveBeenLastCalledWith(0);
  view.unmount();
  expect(cancelFrame).toHaveBeenCalledWith(42);
});

it("uses microphone levels while listening and stops sampling when idle", () => {
  const getAnalyser = vi.fn(() => analyser(0.15));
  const view = render(
    <ChitAvatar state="listening" getAnalyser={getAnalyser} />
  );
  expect(meter.set.mock.lastCall?.[0]).toBeCloseTo(0.56 * 0.3);
  view.rerender(<ChitAvatar state="idle" getAnalyser={getAnalyser} />);
  expect(cancelFrame).toHaveBeenCalledWith(42);
  expect(meter.set).toHaveBeenLastCalledWith(0);
  expect(getAnalyser).toHaveBeenCalledOnce();
});

it("keeps reduced-motion avatars still without sampling audio", () => {
  meter.reduced = true;
  const getAnalyser = vi.fn(() => analyser(0.3));
  render(<ChitAvatar state="speaking" getAnalyser={getAnalyser} />);
  expect(meter.jump).toHaveBeenCalledWith(0);
  expect(getAnalyser).not.toHaveBeenCalled();
});
