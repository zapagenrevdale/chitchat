import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { drawWatercolor, loadWatercolorPaint } from "@/lib/watercolor-paint";

import { WatercolorWave } from "./watercolor-wave";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock(import("motion/react"), async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => motion.reduced,
}));
vi.mock(import("@/lib/watercolor-paint"), async (importOriginal) => ({
  ...(await importOriginal()),
  drawWatercolor: vi.fn(),
  loadWatercolorPaint: vi.fn(async () => null),
}));

const pendingFrames = new Map<number, FrameRequestCallback>();
const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>();
const cancelFrame = vi.fn<(frame: number) => void>();
const resizeObserve = vi.fn();
const resizeDisconnect = vi.fn();
const intersectionDisconnect = vi.fn();
const themeDisconnect = vi.fn();
const getUserMedia = vi.fn();
const requestPermission = vi.fn();
const createAudioContext = vi.fn();
let intersect: (entries: { isIntersecting: boolean }[]) => void;

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices"
);
const originalPermissions = Object.getOwnPropertyDescriptor(
  navigator,
  "permissions"
);

beforeEach(() => {
  vi.clearAllMocks();
  motion.reduced = false;
  pendingFrames.clear();
  let frameId = 0;
  requestFrame.mockImplementation((callback) => {
    frameId += 1;
    pendingFrames.set(frameId, callback);
    return frameId;
  });
  cancelFrame.mockImplementation((frame) => {
    pendingFrames.delete(frame);
  });
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  vi.stubGlobal("AudioContext", createAudioContext);
  vi.stubGlobal("webkitAudioContext", createAudioContext);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: requestPermission },
  });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect"
  ).mockReturnValue({
    width: 600,
    height: 240,
  } as DOMRect);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = resizeObserve;
      disconnect = resizeDisconnect;
    }
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe = vi.fn();
      disconnect = intersectionDisconnect;
    }
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe = vi.fn();
      disconnect = themeDisconnect;
    }
  );
  vi.mocked(loadWatercolorPaint).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalMediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  } else {
    Reflect.deleteProperty(navigator, "mediaDevices");
  }
  if (originalPermissions) {
    Object.defineProperty(navigator, "permissions", originalPermissions);
  } else {
    Reflect.deleteProperty(navigator, "permissions");
  }
});

function nextFrame(time: number) {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  act(() => {
    for (const callback of callbacks) {
      callback(time);
    }
  });
}

function lastLevel() {
  return vi.mocked(drawWatercolor).mock.lastCall?.[0].level ?? 0;
}

it("animates borrowed loudness without requesting microphone or audio access", () => {
  const getLevel = vi.fn(() => 0.8);
  const view = render(<WatercolorWave getLevel={getLevel} />);
  nextFrame(40);
  expect(getLevel).toHaveBeenCalledOnce();
  expect(lastLevel()).toBeGreaterThan(0);
  view.unmount();
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
  expect(createAudioContext).not.toHaveBeenCalled();
});

it("follows each display frame without dropping high-refresh frames", () => {
  const getLevel = vi.fn(() => 0.1);
  render(<WatercolorWave getLevel={getLevel} />);
  vi.mocked(drawWatercolor).mockClear();

  for (const time of [100, 108.33, 116.67, 125, 133.33]) {
    nextFrame(time);
  }

  expect(drawWatercolor).toHaveBeenCalledTimes(5);
  expect(getLevel).toHaveBeenCalledTimes(5);
  const paints = vi.mocked(drawWatercolor).mock.calls.map(([paint]) => paint);
  expect(
    paints.every((paint, index) => paint.time > (paints[index - 1]?.time ?? 0))
  ).toBe(true);
});

it("uses the latest loudness callback and settles when muted without remounting", () => {
  const firstLevel = vi.fn(() => 0.2);
  const nextLevel = vi.fn(() => 0.9);
  const view = render(<WatercolorWave getLevel={firstLevel} />);
  const canvas = view.container.querySelector("canvas");
  nextFrame(40);
  const quietLevel = lastLevel();
  view.rerender(<WatercolorWave getLevel={nextLevel} />);
  nextFrame(80);
  const speakingLevel = lastLevel();
  expect(speakingLevel).toBeGreaterThan(quietLevel);
  expect(firstLevel).toHaveBeenCalledOnce();
  expect(nextLevel).toHaveBeenCalledOnce();

  view.rerender(<WatercolorWave active={false} getLevel={nextLevel} />);
  nextFrame(120);
  expect(lastLevel()).toBeLessThan(speakingLevel);
  expect(lastLevel()).toBeGreaterThan(0);
  expect(nextLevel).toHaveBeenCalledOnce();

  view.rerender(<WatercolorWave active getLevel={nextLevel} />);
  nextFrame(160);
  expect(nextLevel).toHaveBeenCalledTimes(2);
  expect(lastLevel()).toBeGreaterThan(speakingLevel);
  expect(view.container.querySelector("canvas")).toBe(canvas);
  expect(resizeObserve).toHaveBeenCalledOnce();
  expect(loadWatercolorPaint).toHaveBeenCalledOnce();
});

it("draws a still wash for reduced motion without scheduling or sampling", () => {
  motion.reduced = true;
  const getLevel = vi.fn(() => 1);
  render(<WatercolorWave getLevel={getLevel} />);
  expect(drawWatercolor).toHaveBeenCalled();
  expect(lastLevel()).toBe(0);
  expect(requestFrame).not.toHaveBeenCalled();
  expect(getLevel).not.toHaveBeenCalled();
});

it("stops spending frames after a muted wash settles and wakes when reactivated", () => {
  const getLevel = vi.fn(() => 0.9);
  const view = render(<WatercolorWave getLevel={getLevel} />);
  let time = 0;
  for (let frame = 0; frame < 20; frame += 1) {
    time += 100;
    nextFrame(time);
  }
  expect(lastLevel()).toBeGreaterThan(0.5);
  view.rerender(<WatercolorWave active={false} getLevel={getLevel} />);
  getLevel.mockClear();
  for (let frame = 0; frame < 200 && pendingFrames.size > 0; frame += 1) {
    time += 100;
    nextFrame(time);
  }
  expect(lastLevel()).toBeCloseTo(0, 2);
  expect(pendingFrames.size).toBe(0);
  expect(getLevel).not.toHaveBeenCalled();
  vi.mocked(drawWatercolor).mockClear();
  nextFrame(time + 100);
  expect(drawWatercolor).not.toHaveBeenCalled();

  view.rerender(<WatercolorWave active getLevel={getLevel} />);
  expect(pendingFrames.size).toBe(1);
  nextFrame(time + 200);
  expect(getLevel).toHaveBeenCalledOnce();
  expect(lastLevel()).toBeGreaterThan(0);
  expect(pendingFrames.size).toBe(1);
  expect(resizeObserve).toHaveBeenCalledOnce();
  expect(loadWatercolorPaint).toHaveBeenCalledOnce();
});

it("pauses offscreen and hidden animation and resumes only when visible", () => {
  const hidden = vi.spyOn(document, "hidden", "get");
  const getLevel = vi.fn(() => 0.5);
  render(<WatercolorWave getLevel={getLevel} />);
  nextFrame(40);
  expect(pendingFrames.size).toBe(1);

  act(() => intersect([{ isIntersecting: false }]));
  expect(pendingFrames.size).toBe(0);
  nextFrame(80);
  expect(getLevel).toHaveBeenCalledOnce();

  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => intersect([{ isIntersecting: true }]));
  expect(pendingFrames.size).toBe(0);

  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(pendingFrames.size).toBe(1);
  nextFrame(120);
  expect(getLevel).toHaveBeenCalledTimes(2);

  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(pendingFrames.size).toBe(0);
});

it("releases observers, pending frames, and backing pixels on unmount", async () => {
  let finishLoading: ((paint: null) => void) | undefined;
  vi.mocked(loadWatercolorPaint).mockReturnValueOnce(
    new Promise((resolve) => {
      finishLoading = resolve;
    })
  );
  const removeListener = vi.spyOn(document, "removeEventListener");
  const view = render(<WatercolorWave previewLevel={0.5} />);
  const canvas = view.container.querySelector("canvas");
  expect(canvas?.width).toBeGreaterThan(1);
  view.unmount();
  expect(pendingFrames.size).toBe(0);
  expect(resizeDisconnect).toHaveBeenCalledOnce();
  expect(intersectionDisconnect).toHaveBeenCalledOnce();
  expect(themeDisconnect).toHaveBeenCalledOnce();
  expect(removeListener).toHaveBeenCalledWith(
    "visibilitychange",
    expect.any(Function)
  );
  expect(canvas?.width).toBe(1);
  expect(canvas?.height).toBe(1);
  vi.mocked(drawWatercolor).mockClear();
  await act(async () => finishLoading?.(null));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(drawWatercolor).not.toHaveBeenCalled();
  expect(pendingFrames.size).toBe(0);
});
