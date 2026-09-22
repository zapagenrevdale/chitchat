import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as LiveModule from "@/lib/practice-live";

import { usePractice } from "./use-practice";

const live = vi.hoisted(() => ({
  callbacks: [] as ConstructorParameters<typeof LiveModule.PracticeLive>[0][],
  suggestReply: vi.fn<() => Promise<void>>().mockResolvedValue(),
  dismissSuggestion: vi.fn<() => void>(),
  finish: vi.fn<() => void>(),
  start: vi.fn<(selection: unknown) => Promise<void>>().mockResolvedValue(),
  close: vi.fn<() => void>(),
  setMuted: vi.fn<(muted: boolean) => void>(),
}));
vi.mock(import("@/lib/practice-live"), () => ({
  PracticeLive: class {
    constructor(
      callbacks: ConstructorParameters<typeof LiveModule.PracticeLive>[0]
    ) {
      live.callbacks.push(callbacks);
    }
    suggestReply = live.suggestReply;
    dismissSuggestion = live.dismissSuggestion;
    finish = live.finish;
    start = live.start;
    close = live.close;
    setMuted = live.setMuted;
  } as unknown as typeof LiveModule.PracticeLive,
}));
const selection = {
  personaId: "maya",
  placeId: "cafe",
  settingId: "networking",
};
describe("practice controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("AudioWorkletNode", vi.fn<() => void>());
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn<() => void>() },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts once, mutes, and ends the connection", async () => {
    const { result } = renderHook(() => usePractice());
    await act(() => result.current.start(selection));
    await act(() => result.current.start(selection));
    expect(live.start).toHaveBeenCalledOnce();
    act(() => live.callbacks.at(-1)?.onState("listening"));
    act(() => result.current.toggleMute());
    expect(live.setMuted).toHaveBeenCalledWith(true);
    act(() => result.current.end());
    expect(live.finish).toHaveBeenCalledOnce();
    expect(live.close).not.toHaveBeenCalled();
    act(() => result.current.reset());
    expect(result.current.state).toBe("idle");
  });

  it("releases the connection when navigating away", async () => {
    const { result, unmount } = renderHook(() => usePractice());
    await act(() => result.current.start(selection));
    unmount();
    expect(live.close).toHaveBeenCalledOnce();
  });

  it("displays suggestion state and forwards controls to Free talk", async () => {
    const { result } = renderHook(() => usePractice());
    await act(() => result.current.start(selection));
    await act(() => result.current.suggestReply());
    expect(live.suggestReply).toHaveBeenCalledOnce();
    act(() =>
      live.callbacks.at(-1)?.onSuggestion?.({
        text: "I'm doing well.",
        pending: true,
        error: null,
      })
    );
    expect(result.current).toMatchObject({
      suggestion: "I'm doing well.",
      suggestionPending: true,
    });
    act(() =>
      live.callbacks.at(-1)?.onSuggestion?.({
        text: "I'm doing well.",
        pending: false,
        error: "Try again later.",
      })
    );
    expect(result.current).toMatchObject({
      suggestionError: "Try again later.",
      suggestionPending: false,
    });
    act(() => result.current.dismissSuggestion());
    expect(live.dismissSuggestion).toHaveBeenCalledOnce();
    act(() => live.callbacks.at(-1)?.onSuggestion?.(null));
    expect(result.current).toMatchObject({
      suggestion: "",
      suggestionError: null,
      suggestionPending: false,
    });
  });
});
