import type {
  OnboardingDraft,
  OnboardingMessage,
  OnboardingTurn,
} from "@chitchat/contracts/onboarding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnboardingLive } from "@/lib/onboarding-live";
import {
  freshOnboardingDraft,
  onboardingStorageKeys,
  readOnboarding,
} from "@/lib/onboarding-storage";
import { onboardingTurnResponse } from "@/lib/onboarding-turn.test-helper";

import en from "../../../messages/en.json";
import { Onboarding } from "./onboarding";

const sessions = vi.hoisted(
  () =>
    [] as {
      callbacks: ConstructorParameters<typeof OnboardingLive>[0];
      close: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
    }[]
);
vi.mock(import("@/lib/onboarding-live"), () => ({
  OnboardingLive: class {
    constructor(callbacks: ConstructorParameters<typeof OnboardingLive>[0]) {
      sessions.push({
        callbacks,
        close: this.close,
        pause: this.pause,
        resume: this.resume,
      });
    }
    start = vi.fn<OnboardingLive["start"]>().mockResolvedValue();
    close = vi.fn<() => void>();
    pause = vi.fn<() => void>(() => sessions.at(-1)?.callbacks.onPhase("idle"));
    resume = vi.fn<() => void>(() =>
      sessions.at(-1)?.callbacks.onPhase("listening")
    );
    getInputVolume = vi.fn<() => number>().mockReturnValue(0);
    getAnalyser = vi.fn<OnboardingLive["getAnalyser"]>();
  } as unknown as typeof OnboardingLive,
}));
const ready: OnboardingTurn = {
  status: "ready",
  reply: "Let's practice making friends.",
  goal: "Make friends",
  suggestedSkills: ["listening"],
  benefits: {
    ids: ["start-conversations", "listen-and-connect", "keep-it-going"],
    personalized: true,
  },
};
const clarify: OnboardingTurn = {
  status: "clarify",
  reply: "Where do you meet people?",
  goal: "",
  suggestedSkills: [],
};
const choose: OnboardingTurn = {
  status: "choose",
  reply: "Choose what you want to practice.",
  goal: "",
  suggestedSkills: [],
};
const network = vi.fn<typeof fetch>();
function mount(changes: Partial<OnboardingDraft> = {}, editing = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Onboarding
        initial={{
          ...freshOnboardingDraft(),
          name: "Alex",
          step: "motivation",
          conversationMode: "text",
          skills: ["wit"],
          ...changes,
        }}
        onComplete={() => {}}
        onCancel={editing ? () => {} : undefined}
      />
    </QueryClientProvider>
  );
}
function submit(text = "Make friends") {
  fireEvent.change(screen.getByRole("textbox", { name: en.motivation_label }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: en.continue_button }));
}
function hide() {
  act(() => window.dispatchEvent(new Event("pagehide")));
}
function show() {
  act(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true })
    )
  );
}
function voice(editing = false) {
  const view = mount({}, editing);
  fireEvent.click(screen.getByRole("button", { name: en.mode_switch_voice }));
  return view;
}
function latest() {
  const session = sessions.at(-1);
  if (!session) {
    throw new Error("Missing voice controller");
  }
  return session;
}
function openTranscript() {
  fireEvent.click(
    screen.getByRole("button", {
      name: `${en.voice_connecting}. ${en.voice_show_transcript}`,
    })
  );
}
function raw(): OnboardingDraft {
  return JSON.parse(
    localStorage.getItem(onboardingStorageKeys.draft) ?? "null"
  );
}

describe("onboarding suspension and accepted outcomes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessions.length = 0;
    network
      .mockReset()
      .mockImplementation((url) =>
        Promise.resolve(
          String(url).endsWith("/onboarding-turns")
            ? onboardingTurnResponse(ready)
            : Response.json(ready)
        )
      );
    vi.stubGlobal("fetch", network);
    vi.stubGlobal("scrollTo", vi.fn<() => void>());
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("restores confirmed text history and retryable input, rejecting the old late response", async () => {
    const pending = Promise.withResolvers<Response>();
    network.mockReturnValueOnce(pending.promise);
    mount();
    submit();
    hide();
    show();
    expect(
      screen.getByRole("textbox", { name: en.motivation_label })
    ).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: en.motivation_label })
    ).toHaveValue("Make friends");
    await act(() => submit("Meet coworkers"));
    await act(() =>
      pending.resolve(
        onboardingTurnResponse({ ...ready, reply: "Stale response" })
      )
    );
    expect(screen.queryByText("Stale response")).not.toBeInTheDocument();
    expect(
      JSON.parse(String(network.mock.calls[1]?.[1]?.body)).messages
    ).toStrictEqual([{ role: "user", text: "Meet coworkers" }]);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(
      screen.getByRole("heading", { name: en.heading_benefits })
    ).toBeInTheDocument();
  });

  it("removes only the unconfirmed message when a pending text turn is suspended", () => {
    network.mockReturnValueOnce(Promise.withResolvers<Response>().promise);
    mount({
      conversation: [
        { role: "user", text: "Confirmed answer" },
        { role: "assistant", text: "Confirmed question" },
      ],
    });
    submit("Pending answer");
    hide();
    show();
    expect(screen.getByText("Confirmed answer")).toBeInTheDocument();
    expect(screen.getByText("Confirmed question")).toBeInTheDocument();
    expect(
      screen.queryByText("Pending answer", { selector: "p" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: en.motivation_label })
    ).toHaveValue("Pending answer");
  });

  it("keeps an accepted clarification when suspended during its reading delay", async () => {
    network.mockResolvedValueOnce(onboardingTurnResponse(clarify));
    mount();
    await act(() => submit());
    hide();
    show();
    expect(
      screen.getByRole("textbox", { name: en.motivation_label })
    ).toBeEnabled();
    expect(screen.getByRole("log")).toHaveTextContent(clarify.reply);
    await act(() => submit("At work"));
    expect(
      JSON.parse(String(network.mock.calls[1]?.[1]?.body)).messages
    ).toHaveLength(3);
  });

  it.each(["ready", "choose"] as const)(
    "consumes third-turn %s navigation once on persisted pageshow",
    async (status) => {
      network.mockResolvedValueOnce(
        onboardingTurnResponse(status === "ready" ? ready : choose)
      );
      mount({
        conversation: [
          { role: "user", text: "One" },
          { role: "assistant", text: "First question" },
          { role: "user", text: "Two" },
          { role: "assistant", text: "Second question" },
        ],
      });
      await act(() => submit());
      expect(raw().conversation).toHaveLength(6);
      hide();
      show();
      show();
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(
        screen.getByRole("heading", {
          name: status === "ready" ? en.heading_benefits : en.heading_skills,
        })
      ).toBeInTheDocument();
      expect(network).toHaveBeenCalledOnce();
      if (status === "ready") {
        fireEvent.click(
          screen.getByRole("button", { name: en.continue_button })
        );
        show();
      }
      expect(
        screen.getByRole("heading", { name: en.heading_skills })
      ).toBeInTheDocument();
    }
  );

  it("abandons accepted text navigation when switching modes during the delay", async () => {
    mount();
    await act(() => submit());
    hide();
    fireEvent.click(screen.getByRole("button", { name: en.mode_switch_voice }));
    show();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(raw().resolvedGoal).toBeUndefined();
    expect(raw().conversationMode).toBe("voice");
    expect(sessions).toHaveLength(1);
  });

  it.each(["connecting", "listening", "thinking", "speaking"] as const)(
    "interrupts %s voice and requires an explicit restart",
    (phase) => {
      voice();
      const old = latest();
      act(() => old.callbacks.onPhase(phase));
      hide();
      show();
      expect(old.close).toHaveBeenCalledOnce();
      expect(sessions).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: en.voice_restart }));
      expect(sessions).toHaveLength(2);
      act(() => {
        old.callbacks.onComplete(ready);
        old.callbacks.onError("Old failure");
        old.callbacks.onPhase("ready");
        old.callbacks.onMessages(
          [],
          [{ role: "user", text: "Old transcript" }]
        );
      });
      expect({
        resolvedGoal: raw().resolvedGoal,
        conversation: raw().conversation,
      }).toStrictEqual({ resolvedGoal: undefined, conversation: [] });
      expect(screen.queryByText("Old failure")).not.toBeInTheDocument();
    }
  );

  it("pauses transcript capture on the same session without exposing Restart", () => {
    voice();
    openTranscript();
    expect(latest().pause).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: en.voice_restart })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.voice_back }));
    expect(latest().resume).toHaveBeenCalledOnce();
    expect(latest().close).not.toHaveBeenCalled();
    expect(sessions).toHaveLength(1);
  });

  it.each(["ready", "choose"] as const)(
    "immediately persists batched transcript and %s completion while transcript is open, then restores without voice",
    (status) => {
      const view = voice();
      openTranscript();
      const turn = status === "ready" ? ready : choose;
      const conversation: OnboardingMessage[] = [
        { role: "user", text: "Make friends" },
        { role: "assistant", text: ready.reply },
      ];
      act(() => {
        latest().callbacks.onMessages(
          conversation.map((message, id) => ({ ...message, id, final: true })),
          conversation
        );
        latest().callbacks.onComplete(turn);
        expect(raw()).toMatchObject({
          step: "microphone",
          resolvedGoal: turn,
          conversation,
          motivation: turn.goal,
        });
        latest().callbacks.onComplete({
          ...ready,
          goal: "Duplicate must not replace",
        });
        expect(raw().resolvedGoal).toStrictEqual(turn);
      });
      expect(screen.getByRole("log")).toBeInTheDocument();
      hide();
      show();
      expect(
        screen.getByRole("button", { name: en.continue_button })
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: en.voice_restart })
      ).not.toBeInTheDocument();
      const restored = readOnboarding().draft;
      view.unmount();
      mount(restored);
      expect(
        screen.getByRole("heading", {
          name: status === "ready" ? en.heading_benefits : en.heading_skills,
        })
      ).toBeInTheDocument();
      expect({
        sessions: sessions.length,
        requests: network.mock.calls.length,
      }).toStrictEqual({ sessions: 1, requests: 0 });
    }
  );

  it("keeps completed voice Continue working after suspension", () => {
    voice();
    openTranscript();
    act(() => latest().callbacks.onComplete(ready));
    hide();
    show();
    fireEvent.click(screen.getByRole("button", { name: en.continue_button }));
    expect(
      screen.getByRole("heading", { name: en.heading_benefits })
    ).toBeInTheDocument();
  });

  it("reports blocked storage while allowing accepted voice navigation", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    voice();
    openTranscript();
    act(() => latest().callbacks.onComplete(ready));
    expect(screen.getByText(en.progress_error)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.continue_button }));
    expect(
      screen.getByRole("heading", { name: en.heading_benefits })
    ).toBeInTheDocument();
  });

  it("never writes an editing draft, including synchronous voice completion", () => {
    localStorage.setItem(onboardingStorageKeys.draft, "existing draft");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    voice(true);
    openTranscript();
    act(() => latest().callbacks.onComplete(ready));
    fireEvent.click(screen.getByRole("button", { name: en.continue_button }));
    fireEvent.click(screen.getByRole("button", { name: en.cancel_button }));
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(onboardingStorageKeys.draft)).toBe(
      "existing draft"
    );
  });
});
