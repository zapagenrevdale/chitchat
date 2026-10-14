import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useRef } from "react";
import * as sticky from "use-stick-to-bottom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationRail, sampleMessageIndexes } from "./conversation-rail";
import { PracticeConversation } from "./practice-conversation";
import type { usePractice } from "./use-practice";

vi.mock(import("use-stick-to-bottom"), { spy: true });

vi.mock(import("motion/react"), () => ({ useReducedMotion: () => true }));

const practice: ReturnType<typeof usePractice> = {
  guided: {
    text: "",
    confirmed: 0,
    preview: 0,
    phase: "preparing",
    completed: 0,
    skipped: 0,
  },
  suggestion: "",
  suggestionPending: false,
  suggestionError: null,
  suggestReply: async () => {},
  dismissSuggestion: () => {},
  retryGuided: () => {},
  skipGuided: () => {},
  state: "ended",
  error: null,
  captionWarning: null,
  selection: null,
  feedback: null,
  feedbackError: null,
  transcript: { user: "", partner: "" },
  muted: false,
  messages: [
    { id: 1, speaker: "user", text: "Hello" },
    { id: 2, speaker: "partner", text: "Hi" },
  ],
  start: async () => {},
  toggleMute: () => {},
  stopSpeaking: () => {},
  end: () => {},
  reset: () => {},
  getAnalyser: () => null,
  getInputVolume: () => 0,
  getOutputVolume: () => 0,
};

function Transcript({ count }: { count: number }) {
  const target = useRef<HTMLDivElement>(null);
  const messages = Array.from({ length: count }, (_, id) => ({
    id,
    speaker: "user" as const,
    text: `Message ${id}`,
  }));
  return (
    <>
      <ConversationRail
        messages={messages}
        transcriptId="test"
        targetRef={target}
        partnerName="Partner"
        onNavigate={() => {}}
      />
      <div ref={target} data-testid="transcript">
        {messages.map((message) => (
          <div key={message.id} id={`test-${message.id}`}>
            {message.text}
          </div>
        ))}
      </div>
    </>
  );
}

describe(ConversationRail, () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("samples evenly without duplicates while preserving both endpoints", () => {
    expect(sampleMessageIndexes(10, 4)).toStrictEqual([0, 3, 6, 9]);
    expect(sampleMessageIndexes(3, 20)).toStrictEqual([0, 1, 2]);
    expect(sampleMessageIndexes(0, 20)).toStrictEqual([]);
    expect(sampleMessageIndexes(1, 20)).toStrictEqual([0]);
    expect(sampleMessageIndexes(100, 2)).toStrictEqual([0, 99]);
  });

  it("adapts to height and keeps sampled navigation tied to original messages", () => {
    let resize: () => void = vi.fn<() => void>();
    let availableHeight = 40;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(onResize: () => void) {
          resize = onResize;
        }
        observe = vi.fn<(element: HTMLElement) => void>((element) => {
          Object.defineProperty(element, "clientHeight", {
            get: () => availableHeight,
          });
          resize();
        });
        disconnect = vi.fn<() => void>();
      }
    );
    const { rerender } = render(<Transcript count={10} />);
    const log = screen.getByTestId("transcript");
    const scrollTo = vi.fn<HTMLElement["scrollTo"]>();
    Object.defineProperty(log, "scrollTo", { value: scrollTo });
    Object.defineProperty(document.querySelector("#test-6"), "offsetTop", {
      value: 600,
    });
    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(
      screen.getByRole("button", { name: /Jump to message 7\./u })
    );
    expect(scrollTo).toHaveBeenCalledWith({
      top: 584,
      left: 0,
      behavior: "auto",
    });
    availableHeight = 20;
    act(() => resize());
    expect(screen.getAllByRole("button")).toHaveLength(2);
    rerender(<Transcript count={11} />);
    expect(
      screen.getByRole("button", { name: /Jump to message 11\./u })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Jump to message 1\./u })
    ).toBeInTheDocument();
  });

  it("navigates newly appended messages once after rerenders without changing the URL", () => {
    const { rerender } = render(<Transcript count={2} />);
    const transcript = screen.getByTestId("transcript");
    const scrollTo = vi.fn<HTMLElement["scrollTo"]>();
    Object.defineProperty(transcript, "scrollTo", { value: scrollTo });
    const originalUrl = window.location.href;
    rerender(<Transcript count={3} />);
    rerender(<Transcript count={3} />);
    const message = document.querySelector("#test-2");
    Object.defineProperty(message, "offsetTop", { value: 240 });
    const marker = screen.getByRole("button", { name: /Jump to message 3/u });
    fireEvent.click(marker);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 224,
      left: 0,
      behavior: "auto",
    });
    expect(marker).toHaveAttribute("aria-current", "location");
    expect(window.location.href).toBe(originalUrl);
  });

  it("updates the current marker when the transcript scrolls", () => {
    render(<Transcript count={3} />);
    const transcript = screen.getByTestId("transcript");
    Object.defineProperties(transcript, {
      scrollHeight: { value: 900 },
      clientHeight: { value: 300 },
    });
    for (const [id, offset] of [
      [0, 0],
      [1, 300],
      [2, 600],
    ]) {
      Object.defineProperty(
        document.querySelector(`#test-${id}`),
        "offsetTop",
        {
          value: offset,
        }
      );
    }
    fireEvent.scroll(transcript, { target: { scrollTop: 320 } });
    expect(
      screen.getByRole("button", { name: /Jump to message 2/u })
    ).toHaveAttribute("aria-current", "location");
    fireEvent.scroll(transcript, { target: { scrollTop: 600 } });
    expect(
      screen.getByRole("button", { name: /Jump to message 3/u })
    ).toHaveAttribute("aria-current", "location");
    expect(
      screen.getByRole("button", { name: /Jump to message 2/u })
    ).not.toHaveAttribute("aria-current");
  });

  it("navigates the actual scroll viewport and suspends following through the shared context", () => {
    const readContext = vi.mocked(sticky.useStickToBottomContext);
    render(
      <PracticeConversation practice={practice} name="Partner" scene="Cafe" />
    );
    const log = screen.getByRole("log");
    const scrollTo = vi.fn<HTMLElement["scrollTo"]>();
    Object.defineProperty(log, "scrollTo", { value: scrollTo });
    Object.defineProperty(screen.getByText("Hi").parentElement, "offsetTop", {
      value: 240,
    });
    fireEvent.click(screen.getByRole("button", { name: /Jump to message 2/u }));
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 224,
      left: 0,
      behavior: "auto",
    });
    const context = readContext.mock.results.at(-1)?.value;
    expect(context.scrollRef.current).toBe(log);
    expect(context.escapedFromLock).toBeTruthy();
  });

  it("keeps the viewport and keyboard focus stable as a reply grows", () => {
    const { rerender } = render(
      <PracticeConversation practice={practice} name="Partner" scene="Cafe" />
    );
    const log = screen.getByRole("log");
    log.focus();
    const updated = {
      ...practice,
      messages: [
        ...practice.messages,
        { id: 3, speaker: "partner" as const, text: "How" },
      ],
    };
    rerender(
      <PracticeConversation practice={updated} name="Partner" scene="Cafe" />
    );
    const reply = screen.getByText("How");
    rerender(
      <PracticeConversation
        practice={{
          ...updated,
          messages: [
            ...practice.messages,
            { id: 3, speaker: "partner", text: "How are you?" },
          ],
        }}
        name="Partner"
        scene="Cafe"
      />
    );
    expect(screen.getByRole("log")).toBe(log);
    expect(log).toHaveFocus();
    expect(screen.getByText("How are you?")).toBe(reply);
    expect(screen.getAllByText("How are you?")).toHaveLength(1);
  });
});
