/* oxlint-disable vitest/max-expects -- Lifecycle transitions verify both visible output and resource ownership. */
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveWaveform } from "@/components/ui/live-waveform";

function analyser() {
  return {
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn<(data: Uint8Array) => void>((data) => {
      data.fill(180);
    }),
    disconnect: vi.fn<() => void>(),
  };
}

describe("shared conversation waveform", () => {
  const getUserMedia = vi.fn<() => Promise<MediaStream>>();
  const createContext = vi.fn<() => void>();
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let time = 0;
  let visibleBars: number;
  let width: number;
  let resize: () => void;
  let disconnect: ReturnType<typeof vi.fn>;
  let clear: ReturnType<typeof vi.fn>;

  function advance(count = 1) {
    act(() => {
      for (let index = 0; index < count; index += 1) {
        time += 16;
        const scheduled = [...frames.keys()];
        for (const id of scheduled) {
          const onFrame = frames.get(id);
          frames.delete(id);
          onFrame?.(time);
        }
      }
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    frames = new Map();
    nextFrame = 0;
    time = 0;
    visibleBars = 0;
    width = 200;
    disconnect = vi.fn<() => void>();
    clear = vi.fn<CanvasRenderingContext2D["clearRect"]>(() => {
      visibleBars = 0;
    });
    const context = {
      scale: vi.fn<CanvasRenderingContext2D["scale"]>(),
      clearRect: clear,
      beginPath: vi.fn<() => void>(),
      roundRect: vi.fn<CanvasRenderingContext2D["roundRect"]>(),
      fill: vi.fn<() => void>(() => {
        visibleBars += 1;
      }),
      fillRect: vi.fn<CanvasRenderingContext2D["fillRect"]>(() => {
        if (context.globalCompositeOperation !== "destination-out") {
          visibleBars += 1;
        }
      }),
      createLinearGradient: vi.fn<
        CanvasRenderingContext2D["createLinearGradient"]
      >(() => ({ addColorStop: vi.fn<CanvasGradient["addColorStop"]>() })),
      globalCompositeOperation: "source-over",
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({
        width,
        height: 64,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 64,
        toJSON: () => ({}),
      })
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    vi.stubGlobal("requestAnimationFrame", (onFrame: FrameRequestCallback) => {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, onFrame);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(onResize: () => void) {
          resize = onResize;
          this.observe = onResize;
        }
        observe: () => void;
        disconnect = disconnect;
      }
    );
    vi.stubGlobal("AudioContext", createContext);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("settles a fresh idle canvas and wakes once for coalesced resizes", () => {
    render(<LiveWaveform analyser={null} />);
    advance(3);
    expect(visibleBars).toBe(0);
    expect(frames.size).toBe(0);
    const clears = clear.mock.calls.length;
    width = 320;
    act(() => {
      resize();
      resize();
    });
    expect(frames.size).toBe(1);
    advance(3);
    expect(clear).toHaveBeenLastCalledWith(0, 0, 320, 64);
    expect(clear).toHaveBeenCalledTimes(clears + 1);
    expect(frames.size).toBe(0);
  });

  it.each(["static", "scrolling"] as const)(
    "clears the last faded bars and settles in %s mode",
    (mode) => {
      const { rerender } = render(
        <LiveWaveform processing analyser={null} mode={mode} />
      );
      advance(5);
      expect(visibleBars).toBeGreaterThan(0);
      rerender(<LiveWaveform analyser={null} mode={mode} />);
      advance(45);
      expect(visibleBars).toBe(0);
      expect(frames.size).toBe(0);
      const clears = clear.mock.calls.length;
      advance(10);
      expect(clear).toHaveBeenCalledTimes(clears);
    }
  );

  it("cancels the latest drawing and fade frames on unmount", () => {
    const { rerender, unmount } = render(
      <LiveWaveform processing analyser={null} />
    );
    advance(5);
    rerender(<LiveWaveform analyser={null} />);
    advance(4);
    expect(visibleBars).toBeGreaterThan(0);
    unmount();
    expect(frames.size).toBe(0);
    const clears = clear.mock.calls.length;
    advance(50);
    expect(clear).toHaveBeenCalledTimes(clears);
    expect(disconnect).toHaveBeenCalledWith();
  });

  it.each(["processing", "active"] as const)(
    "cancels the old fade when %s restarts",
    (state) => {
      const input = analyser();
      const borrowed = input as unknown as AnalyserNode;
      const { rerender, unmount } = render(
        <LiveWaveform processing analyser={borrowed} />
      );
      advance(5);
      rerender(<LiveWaveform analyser={borrowed} />);
      advance(4);
      const oldFrames = [...frames.keys()];
      rerender(
        <LiveWaveform
          processing={state === "processing"}
          active={state === "active"}
          analyser={borrowed}
        />
      );
      expect(oldFrames.filter((id) => frames.has(id))).toStrictEqual([]);
      advance(45);
      expect(visibleBars).toBeGreaterThan(0);
      expect(frames.size).toBeGreaterThan(0);
      unmount();
      expect(frames.size).toBe(0);
    }
  );

  it("wakes processing and active rendering after idle and clears borrowed active bars on stop", () => {
    const input = analyser();
    const borrowed = input as unknown as AnalyserNode;
    const { rerender } = render(<LiveWaveform analyser={borrowed} />);
    advance(3);
    expect(frames.size).toBe(0);
    rerender(<LiveWaveform processing analyser={borrowed} />);
    advance(5);
    expect(visibleBars).toBeGreaterThan(0);
    rerender(<LiveWaveform active analyser={borrowed} />);
    advance(5);
    expect(input.getByteFrequencyData).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    expect(visibleBars).toBeGreaterThan(0);
    rerender(<LiveWaveform analyser={borrowed} />);
    advance();
    expect(visibleBars).toBe(0);
    advance(45);
    expect(frames.size).toBe(0);
  });

  it("waits for an explicit null analyser without requesting another microphone", () => {
    const { unmount } = render(<LiveWaveform active analyser={null} />);
    advance(5);
    expect(visibleBars).toBe(0);
    unmount();
    expect(frames.size).toBe(0);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createContext).not.toHaveBeenCalled();
  });

  it("samples replacement analysers without releasing borrowed resources", () => {
    const input = analyser();
    const output = analyser();
    const onStreamEnd = vi.fn<() => void>();
    const { rerender, unmount } = render(
      <LiveWaveform
        active
        analyser={input as unknown as AnalyserNode}
        onStreamEnd={onStreamEnd}
      />
    );
    advance(5);
    expect(input.getByteFrequencyData).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    const samples = input.getByteFrequencyData.mock.calls.length;
    rerender(
      <LiveWaveform
        active
        analyser={output as unknown as AnalyserNode}
        onStreamEnd={onStreamEnd}
      />
    );
    advance(5);
    expect(output.getByteFrequencyData).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    expect(input.getByteFrequencyData).toHaveBeenCalledTimes(samples);
    expect(visibleBars).toBeGreaterThan(0);
    unmount();
    expect(frames.size).toBe(0);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createContext).not.toHaveBeenCalled();
    expect(input.disconnect).not.toHaveBeenCalled();
    expect(output.disconnect).not.toHaveBeenCalled();
    expect(onStreamEnd).not.toHaveBeenCalled();
  });

  it("cleans up StrictMode replay and subsequent processing frames", () => {
    const { unmount } = render(
      <StrictMode>
        <LiveWaveform processing analyser={null} />
      </StrictMode>
    );
    advance(5);
    expect(visibleBars).toBeGreaterThan(0);
    unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
