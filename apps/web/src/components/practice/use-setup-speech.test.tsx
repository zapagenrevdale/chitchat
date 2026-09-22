import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SetupAnswer } from "./setup-answer";
import { useSetupSpeech } from "./use-setup-speech";

class MockRecognition extends EventTarget {
  static current: MockRecognition;
  constructor() {
    super();
    MockRecognition.current = this;
  }
  lang = "";
  continuous = false;
  interimResults = false;
  start = vi.fn<() => void>();
  stop = vi.fn<() => void>();
  abort = vi.fn<() => void>();
}
function transcript(text: string) {
  const event = new Event("result");
  Object.defineProperty(event, "results", {
    value: { length: 1, 0: { 0: { transcript: text } } },
  });
  MockRecognition.current.dispatchEvent(event);
}

describe("setup speech input", () => {
  beforeEach(() => {
    MockRecognition.current = new MockRecognition();
    vi.stubGlobal("SpeechRecognition", MockRecognition);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("doesn't request a microphone until activated, and releases it on unmount", () => {
    const onTranscript = vi.fn<(text: string) => void>();
    const { result, unmount } = renderHook(() => useSetupSpeech(onTranscript));
    expect(MockRecognition.current.start).not.toHaveBeenCalled();
    act(() => result.current.start());
    expect(MockRecognition.current.start).toHaveBeenCalledOnce();
    expect(result.current.listening).toBeTruthy();
    unmount();
    expect(MockRecognition.current.abort).toHaveBeenCalledOnce();
    transcript("Late answer");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("shows the transcript for editing before it is applied", async () => {
    const answer = vi.fn<(text: string) => void>();
    const user = userEvent.setup();
    render(<SetupAnswer busy={false} onAnswer={answer} />);
    await user.click(
      screen.getByRole("button", { name: "Tell us your choice" })
    );
    act(() => transcript("A hotel in Kyoto"));
    expect(screen.getByLabelText("Or make it your own")).toHaveValue(
      "A hotel in Kyoto"
    );
    act(() => MockRecognition.current.dispatchEvent(new Event("end")));
    await user.clear(screen.getByLabelText("Or make it your own"));
    await user.type(
      screen.getByLabelText("Or make it your own"),
      "A hotel in Tokyo"
    );
    await user.click(screen.getByRole("button", { name: "Use answer" }));
    expect(answer).toHaveBeenCalledWith("A hotel in Tokyo");
  });

  it("keeps typed input usable when microphone access is denied", async () => {
    const user = userEvent.setup();
    render(
      <SetupAnswer busy={false} onAnswer={vi.fn<(text: string) => void>()} />
    );
    await user.click(
      screen.getByRole("button", { name: "Tell us your choice" })
    );
    act(() => {
      const event = new Event("error");
      Object.defineProperty(event, "error", { value: "not-allowed" });
      MockRecognition.current.dispatchEvent(event);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Microphone access was denied"
    );
    expect(screen.getByLabelText("Or make it your own")).toBeEnabled();
    expect(MockRecognition.current.abort).toHaveBeenCalledOnce();
  });

  it("stops speech recognition when a partner preview begins", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<(text: string) => void>();
    const onVoiceStart = vi.fn<() => void>();
    const { rerender } = render(
      <SetupAnswer
        busy={false}
        onAnswer={onAnswer}
        onVoiceStart={onVoiceStart}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Tell us your choice" })
    );
    expect(onVoiceStart).toHaveBeenCalledOnce();
    act(() => transcript("A café"));
    rerender(
      <SetupAnswer
        busy={false}
        onAnswer={onAnswer}
        previewing
        onVoiceStart={onVoiceStart}
      />
    );
    expect(MockRecognition.current.abort).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Or make it your own")).toHaveValue("A café");
    expect(screen.getByLabelText("Or make it your own")).toBeEnabled();
  });

  it("offers a typed fallback in browsers without speech recognition", () => {
    vi.stubGlobal("SpeechRecognition", null);
    vi.stubGlobal("webkitSpeechRecognition", null);
    render(
      <SetupAnswer busy={false} onAnswer={vi.fn<(text: string) => void>()} />
    );
    expect(
      screen.getByRole("button", { name: "Tell us your choice" })
    ).toBeDisabled();
    expect(screen.getByLabelText("Or make it your own")).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Voice input isn't available in this browser"
    );
  });

  it("releases recognition on page hide and ignores a late transcript", () => {
    const onTranscript = vi.fn<(text: string) => void>();
    const { result } = renderHook(() => useSetupSpeech(onTranscript));
    act(() => result.current.start());
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(result.current.listening).toBeFalsy();
    expect(MockRecognition.current.abort).toHaveBeenCalledOnce();
    act(() => transcript("Late"));
    expect(onTranscript).not.toHaveBeenCalled();
  });
});
