import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveWaveform } from "@/components/ui/live-waveform";

describe("shared conversation waveform", () => {
  const getUserMedia = vi.fn<() => Promise<MediaStream>>();
  const createContext = vi.fn<() => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn<() => void>();
        disconnect = vi.fn<() => void>();
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

  it("waits for the conversation's analyser without requesting another microphone", () => {
    const { unmount } = render(<LiveWaveform active analyser={null} />);
    unmount();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createContext).not.toHaveBeenCalled();
  });

  it("switches between borrowed analysers without closing or disconnecting the conversation", () => {
    const disconnectInput = vi.fn<() => void>();
    const disconnectOutput = vi.fn<() => void>();
    const input = { disconnect: disconnectInput } as unknown as AnalyserNode;
    const output = { disconnect: disconnectOutput } as unknown as AnalyserNode;
    const onStreamEnd = vi.fn<() => void>();
    const { rerender, unmount } = render(
      <LiveWaveform active analyser={input} onStreamEnd={onStreamEnd} />
    );
    rerender(
      <LiveWaveform active analyser={output} onStreamEnd={onStreamEnd} />
    );
    unmount();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(disconnectInput).not.toHaveBeenCalled();
    expect(disconnectOutput).not.toHaveBeenCalled();
    expect(onStreamEnd).not.toHaveBeenCalled();
  });
});
