import type { PracticeFeedback } from "@chitchat/contracts";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as LiveModule from "@/lib/practice-live";
import type { PracticeMessage } from "@/lib/practice-session";

import { PracticeConversation } from "./practice-conversation";
import { usePractice } from "./use-practice";

const live = vi.hoisted(() => ({
  callbacks: [] as ConstructorParameters<typeof LiveModule.PracticeLive>[0][],
  close: vi.fn<() => void>(),
}));
vi.mock(import("@/lib/practice-live"), () => ({
  PracticeLive: class {
    callbacks: ConstructorParameters<typeof LiveModule.PracticeLive>[0];
    constructor(
      callbacks: ConstructorParameters<typeof LiveModule.PracticeLive>[0]
    ) {
      live.callbacks.push(callbacks);
      this.callbacks = callbacks;
    }
    start = () => {
      this.callbacks.onState("listening");
      return Promise.resolve();
    };
    finish = () => {
      this.callbacks.onState("reviewing");
    };
    close = live.close;
    getAnalyser = vi.fn<() => null>().mockReturnValue(null);
  } as unknown as typeof LiveModule.PracticeLive,
}));
vi.mock(import("@/components/ui/live-waveform"), () => ({
  LiveWaveform: () => <div />,
}));

const selection = {
  personaId: "theo",
  placeId: "cafe",
  settingId: "casual",
  goal: "Find something in common.",
};
const messages: PracticeMessage[] = [
  { id: 1, speaker: "partner", text: "I run in the park." },
  {
    id: 2,
    speaker: "user",
    text: "I walk there on weekends too. What's your favorite part?",
  },
  { id: 3, speaker: "partner", text: "The lake, definitely." },
  {
    id: 4,
    speaker: "user",
    text: "I love the lake! Have you tried the new path?",
  },
  { id: 5, speaker: "partner", text: "Not yet, is it nice?" },
  {
    id: 6,
    speaker: "user",
    text: "Yes, it winds through the trees. I think you'd enjoy it.",
  },
];
const feedback: PracticeFeedback = {
  status: "scored",
  score: 8,
  summary: "You found common ground through your walks in the park.",
  curiosity: {
    score: 4,
    note: "Your question about the path kept the conversation going.",
  },
  listening: { score: 4, note: "You picked up on Theo's favorite spot." },
  sharing: {
    score: 4,
    note: "Your own walks gave Theo something to respond to.",
  },
  highlight: {
    messageId: 2,
    quote: "I walk there on weekends too.",
    note: "That detail helped you connect.",
  },
  nextStep: {
    tip: "Add a little more about what you enjoy there.",
  },
};
const fetchFeedback = vi.fn<typeof fetch>();

function Harness() {
  const practice = usePractice();
  return practice.state === "idle" ? (
    <button
      type="button"
      onClick={() => {
        void practice.start(selection);
      }}
    >
      Start practice
    </button>
  ) : (
    <PracticeConversation practice={practice} name="Theo" scene="Cafe" />
  );
}

async function startConversation() {
  const user = userEvent.setup();
  const view = render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Start practice" }));
  const callbacks = live.callbacks.at(-1);
  if (!callbacks) {
    throw new Error("No practice connection.");
  }
  return { user, callbacks, ...view };
}

describe("conversation recap", () => {
  beforeEach(() => {
    live.callbacks.length = 0;
    vi.clearAllMocks();
    fetchFeedback.mockReset().mockResolvedValue(Response.json(feedback));
    vi.stubGlobal("fetch", fetchFeedback);
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

  it("switches to feedback from the same partner with the microphone off", async () => {
    const { user, callbacks } = await startConversation();
    act(() => {
      for (const message of messages) {
        callbacks.onMessage?.(message);
      }
    });
    await user.click(screen.getByRole("button", { name: "End conversation" }));
    expect(
      screen.getByRole("heading", { name: "Feedback from Theo" })
    ).toHaveFocus();
    expect(
      screen.getByText("Theo is reflecting on your conversation…")
    ).toBeInTheDocument();
    expect(screen.getByText("Your microphone is off")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unmute microphone" })
    ).not.toBeInTheDocument();
    expect(fetchFeedback).not.toHaveBeenCalled();
  });

  it("shows the confirmed score while the partner speaks and preserves the transcript", async () => {
    const { user, callbacks } = await startConversation();
    act(() => {
      for (const message of messages) {
        callbacks.onMessage?.(message);
      }
      callbacks.onState("reviewing");
      callbacks.onFeedback?.(feedback);
    });
    expect(
      screen.getByLabelText("Conversation score: 8 out of 10")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stop voice recap" })
    ).toBeInTheDocument();
    expect(screen.getByRole("log")).not.toBeVisible();
    await user.click(screen.getByText("View conversation"));
    expect(screen.getByRole("log")).toHaveTextContent(messages[1].text);
    act(() => callbacks.onState("ended"));
    expect(
      screen.getByRole("button", { name: "Practice again" })
    ).toBeInTheDocument();
  });

  it("also displays feedback when the partner ends naturally", async () => {
    const { callbacks } = await startConversation();
    act(() => {
      callbacks.onState("reviewing");
      callbacks.onFeedback?.(feedback);
      callbacks.onState("ended");
    });
    expect(screen.getByText("Keep this")).toBeInTheDocument();
    expect(screen.getByText("Try next time")).toBeInTheDocument();
    expect(fetchFeedback).not.toHaveBeenCalled();
  });

  it("preserves written feedback if the spoken recap fails", async () => {
    const { callbacks } = await startConversation();
    act(() => {
      callbacks.onState("reviewing");
      callbacks.onFeedback?.(feedback);
      callbacks.onFeedbackError?.(
        "The voice recap couldn't finish. Your written feedback is ready."
      );
      callbacks.onState("ended");
    });
    expect(
      screen.getByLabelText("Conversation score: 8 out of 10")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/voice recap couldn't finish/u)
    ).toBeInTheDocument();
  });

  it("does not run a replacement scorer when the live session is lost", async () => {
    const { callbacks } = await startConversation();
    act(() => callbacks.onState("ended"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "before Theo could review it"
    );
    expect(fetchFeedback).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText(/Conversation score/u)
    ).not.toBeInTheDocument();
  });

  it("explains insufficient evidence without displaying zero", async () => {
    const { callbacks } = await startConversation();
    act(() => {
      callbacks.onState("reviewing");
      callbacks.onFeedback?.({ status: "insufficient" });
    });
    expect(screen.getByText(/No score yet/u)).toHaveTextContent("Theo");
    expect(
      screen.queryByLabelText(/Conversation score/u)
    ).not.toBeInTheDocument();
  });

  it("clears the previous review when starting again", async () => {
    const { user, callbacks } = await startConversation();
    act(() => {
      callbacks.onFeedback?.(feedback);
      callbacks.onState("ended");
    });
    await user.click(screen.getByRole("button", { name: "Practice again" }));
    expect(live.close).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    act(() => live.callbacks.at(-1)?.onState("reviewing"));
    expect(
      screen.queryByLabelText(/Conversation score/u)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Theo is reflecting on your conversation…")
    ).toBeInTheDocument();
  });
});
