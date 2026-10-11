import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WatercolorWave } from "@/components/ui/watercolor-wave";

import { PracticeConversation } from "./practice-conversation";
import type { usePractice } from "./use-practice";

vi.mock(import("@/components/ui/watercolor-wave"), () => ({
  WatercolorWave: vi.fn<typeof WatercolorWave>(() => (
    <canvas aria-hidden="true" />
  )),
}));

type Practice = ReturnType<typeof usePractice>;

function createPractice(overrides: Partial<Practice> = {}): Practice {
  return {
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
    state: "listening",
    error: null,
    captionWarning: null,
    selection: null,
    feedback: null,
    feedbackError: null,
    transcript: { user: "", partner: "" },
    muted: false,
    messages: [],
    start: async () => {},
    toggleMute: vi.fn<() => void>(),
    stopSpeaking: () => {},
    end: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
    getAnalyser: vi.fn<() => AnalyserNode | null>(),
    getInputVolume: () => 0.4,
    getOutputVolume: vi.fn<() => number>(),
    ...overrides,
  };
}

function conversation(practice: Practice) {
  return (
    <PracticeConversation practice={practice} name="Alex" scene="At a cafe" />
  );
}

describe(PracticeConversation, () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses microphone loudness for the paint even while the partner speaks", () => {
    const practice = createPractice({ state: "talking" });
    render(conversation(practice));

    expect(vi.mocked(WatercolorWave).mock.lastCall?.[0]).toMatchObject({
      active: true,
      getLevel: practice.getInputVolume,
    });
    expect(practice.getAnalyser).not.toHaveBeenCalled();
    expect(practice.getOutputVolume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
    fireEvent.click(screen.getByRole("button", { name: "End conversation" }));
    expect(practice.toggleMute).toHaveBeenCalledOnce();
    expect(practice.end).toHaveBeenCalledOnce();
  });

  it("rests the paint while muted or reconnecting and restores microphone response", () => {
    const practice = createPractice();
    const { rerender } = render(conversation(practice));

    rerender(conversation({ ...practice, muted: true }));
    expect(vi.mocked(WatercolorWave).mock.lastCall?.[0]).toMatchObject({
      active: false,
    });
    expect(screen.getByText("Microphone muted")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unmute microphone" })
    ).toBeInTheDocument();

    rerender(conversation({ ...practice, state: "reconnecting" }));
    expect(vi.mocked(WatercolorWave).mock.lastCall?.[0]).toMatchObject({
      active: false,
    });

    rerender(conversation(practice));
    expect(vi.mocked(WatercolorWave).mock.lastCall?.[0]).toMatchObject({
      active: true,
    });
  });

  it("keeps guided paint still until a phrase can receive microphone input", () => {
    const practice = createPractice({
      selection: {
        personaId: "alex",
        placeId: "cafe",
        settingId: "casual",
        mode: "guided",
      },
    });
    const { rerender } = render(conversation(practice));
    for (const phase of ["preparing", "complete", "error"] as const) {
      rerender(
        conversation({
          ...practice,
          guided: { ...practice.guided, phase },
        })
      );
      expect(vi.mocked(WatercolorWave).mock.lastCall?.[0]).toMatchObject({
        active: false,
      });
    }
    expect(
      screen.getByText("Microphone paused · try again")
    ).toBeInTheDocument();
    rerender(
      conversation({
        ...practice,
        guided: { ...practice.guided, phase: "listening", text: "Hello!" },
      })
    );
    expect(vi.mocked(WatercolorWave).mock.lastCall?.[0]).toMatchObject({
      active: true,
    });
    expect(screen.getByLabelText("Hello!")).toBeInTheDocument();
  });

  it("removes the listening paint and microphone controls during recap and after ending", () => {
    const practice = createPractice();
    const { container, rerender } = render(conversation(practice));

    rerender(conversation({ ...practice, state: "reviewing" }));
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(screen.getByText("Your microphone is off")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mute microphone" })
    ).not.toBeInTheDocument();

    rerender(conversation({ ...practice, state: "ended" }));
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Practice again" }));
    expect(practice.reset).toHaveBeenCalledOnce();
  });
});
