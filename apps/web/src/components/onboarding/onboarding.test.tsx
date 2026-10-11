import type {
  OnboardingDraft,
  OnboardingMessage,
  OnboardingProfile,
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
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnboardingLiveMessage } from "@/lib/onboarding-live";
import {
  freshOnboardingDraft,
  readOnboarding,
  saveOnboardingProfile,
} from "@/lib/onboarding-storage";
import { onboardingTurnResponse } from "@/lib/onboarding-turn.test-helper";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fil from "../../../messages/fil.json";
import ja from "../../../messages/ja.json";
import welcomes from "../../../public/audio/chit/welcome/manifest.json";
import { Onboarding } from "./onboarding";
import type { useOnboardingLive } from "./use-onboarding-live";

vi.mock(import("@/components/ui/watercolor-wave"), () => ({
  WatercolorWave: ({ active = true }: { active?: boolean }) => (
    <div data-testid="listening-watercolor" data-active={active} />
  ),
}));

type LiveState = Pick<
  ReturnType<typeof useOnboardingLive>,
  "phase" | "messages" | "error" | "result"
>;
interface MockSession {
  onMessages: (messages: OnboardingMessage[]) => void;
  update: (state: Partial<LiveState>) => void;
  close: ReturnType<typeof vi.fn<() => void>>;
  pause: ReturnType<typeof vi.fn<() => void>>;
  resume: ReturnType<typeof vi.fn<() => void>>;
}
const liveMocks = vi.hoisted(() => ({ sessions: [] as MockSession[] }));
vi.mock(import("./use-onboarding-live"), () => ({
  useOnboardingLive: ({
    onMessages,
    onResolved,
  }: Parameters<typeof useOnboardingLive>[0]) => {
    const [state, setState] = useState<LiveState>({
      phase: "connecting",
      messages: [],
      error: null,
      result: null,
    });
    const session = useRef<MockSession | null>(null);
    useEffect(() => {
      const current: MockSession = {
        onMessages,
        update: (changes) => {
          setState((previous) => ({ ...previous, ...changes }));
          if (changes.result && changes.result.status !== "clarify") {
            onResolved({ ...changes.result, status: changes.result.status });
          }
        },
        close: vi.fn<() => void>(),
        pause: vi.fn<() => void>(),
        resume: vi.fn<() => void>(),
      };
      session.current = current;
      liveMocks.sessions.push(current);
      return () => current.close();
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- A session deliberately captures the attempt's callbacks.
    }, []);
    return {
      ...state,
      start: () => {},
      stop: () => session.current?.close(),
      pause: () => session.current?.pause(),
      resume: () => session.current?.resume(),
      getInputVolume: () => 0,
      getAnalyser: () => null,
    };
  },
}));
function latestLive() {
  const session = liveMocks.sessions.at(-1);
  if (!session) {
    throw new Error("No live session");
  }
  return session;
}
const reply: OnboardingTurn = {
  status: "ready",
  reply: "We can practice getting to know someone together.",
  goal: "I want to make friends.",
  suggestedSkills: ["listening", "conversation-flow"],
  benefits: {
    ids: ["start-conversations", "listen-and-connect", "keep-it-going"],
    personalized: true,
  },
};
const fetchRecommendation = vi.fn<typeof fetch>();
const audio = vi.fn<(src?: string) => HTMLAudioElement>();
const clips: HTMLAudioElement[] = [];
function renderOnboarding(
  initial: OnboardingDraft = freshOnboardingDraft(),
  editing = false
) {
  const complete = vi.fn<(profile: OnboardingProfile) => void>();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <Onboarding
        initial={initial}
        onComplete={complete}
        onCancel={editing ? () => {} : undefined}
      />
    </QueryClientProvider>
  );
  return { complete, client, ...view };
}
function initialText(): OnboardingDraft {
  return {
    ...freshOnboardingDraft(),
    name: "Alex",
    step: "motivation",
    conversationMode: "text",
    skills: ["wit"],
  };
}
async function startVoice() {
  const view = renderOnboarding({
    ...freshOnboardingDraft(),
    name: "Alex",
    step: "microphone",
    skills: ["wit"],
  });
  await userEvent.click(screen.getByRole("button", { name: en.voice_answer }));
  return view;
}
function emitMessages(session: MockSession, messages: OnboardingMessage[]) {
  act(() => {
    session.update({
      messages: messages.map((message, id): OnboardingLiveMessage => ({
        ...message,
        id,
        final: true,
      })),
    });
    session.onMessages(messages);
  });
}
function submitText(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: en.motivation_label }), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: en.continue_button }));
}
function submitName() {
  const { form } = screen.getByRole<HTMLInputElement>("textbox", {
    name: en.name_label,
  });
  if (!form) {
    throw new Error("No name form");
  }
  fireEvent.submit(form);
}
function blockedAudio() {
  const clip = document.createElement("audio");
  vi.spyOn(clip, "play").mockRejectedValue(
    new DOMException("Blocked", "NotAllowedError")
  );
  vi.spyOn(clip, "pause").mockImplementation(() => {});
  return clip;
}

describe("onboarding", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    localStorage.clear();
    liveMocks.sessions.length = 0;
    audio.mockReset();
    clips.length = 0;
    function createAudio(src?: string) {
      const clip = document.createElement("audio");
      clip.src = src ?? "";
      // oxlint-disable-next-line unicorn/no-useless-undefined -- play resolves without a value.
      vi.spyOn(clip, "play").mockResolvedValue(undefined);
      vi.spyOn(clip, "pause").mockImplementation(() => {});
      clips.push(clip);
      return clip;
    }
    audio.mockImplementation(createAudio);
    vi.stubGlobal("Audio", audio);
    vi.stubGlobal("AudioContext", () => {
      throw new Error("Web Audio unavailable");
    });
    fetchRecommendation.mockReset().mockImplementation((url) =>
      Promise.resolve(
        String(url).endsWith("/onboarding-turns")
          ? onboardingTurnResponse(reply)
          : Response.json({
              acknowledgment: reply.reply,
              suggestedSkills: reply.suggestedSkills,
              benefits: reply.benefits,
            })
      )
    );
    vi.stubGlobal("fetch", fetchRecommendation);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("welcome playback", () => {
    /* oxlint-disable vitest/max-expects */
    it("reveals recorded words at their audio times after name submission", async () => {
      renderOnboarding({
        ...freshOnboardingDraft(),
        step: "name",
        name: "Alex",
      });
      submitName();
      expect(audio).toHaveBeenCalledOnce();
      const [clip] = clips;
      expect(clip.play).toHaveBeenCalledOnce();
      const heading = screen.getByRole("heading", { level: 1 });
      const words = heading.querySelectorAll("span");
      expect(heading).toHaveAccessibleName(welcomes[0].text);
      expect(heading).toHaveFocus();
      expect(words[0]).toHaveTextContent("Welcome!");
      act(() => {
        clip.currentTime = 0.29;
        clip.dispatchEvent(new Event("timeupdate"));
      });
      expect(words[0]).toHaveStyle({ opacity: "0" });
      act(() => {
        clip.currentTime = 0.3;
        clip.dispatchEvent(new Event("timeupdate"));
      });
      expect(words[0]).toHaveStyle({ opacity: "1" });
      expect(words[1]).toHaveStyle({ opacity: "0" });
      act(() => {
        clip.currentTime = 1.7;
        clip.dispatchEvent(new Event("timeupdate"));
      });
      expect(words[1]).toHaveStyle({ opacity: "1" });
      expect(words[2]).toHaveStyle({ opacity: "0" });
      expect(
        screen.getByRole("button", { name: en.voice_answer })
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: en.mode_answer_text })
      ).toBeEnabled();
      await userEvent.click(
        screen.getByRole("button", { name: "Skip intro (dev)" })
      );
      expect(clip.pause).toHaveBeenCalledOnce();
      expect(heading).toHaveFocus();
      expect(
        screen.queryByRole("button", { name: "Skip intro (dev)" })
      ).not.toBeInTheDocument();
      expect(
        [...words].every((word) => word.style.opacity === "1")
      ).toBeTruthy();
      expect(heading).toHaveAccessibleName(welcomes[0].text);
    });
    /* oxlint-enable vitest/max-expects */

    it.each([
      en.voice_answer,
      en.mode_answer_text,
      en.back_button,
      en.cancel_button,
    ])("stops the welcome when choosing %s", async (label) => {
      renderOnboarding(
        { ...freshOnboardingDraft(), step: "name", name: "Alex" },
        true
      );
      submitName();
      const [clip] = clips;
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(clip.pause).toHaveBeenCalledOnce();
    });

    /* oxlint-disable vitest/max-expects */
    it("does not autoplay a restored welcome or offer replay or skip", () => {
      renderOnboarding({
        ...freshOnboardingDraft(),
        step: "microphone",
        name: "Alex",
      });
      expect(audio).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: en.voice_listen })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Skip intro (dev)" })
      ).not.toBeInTheDocument();
    });

    it("keeps voice and text available after blocked welcome playback", async () => {
      audio.mockImplementationOnce(blockedAudio);
      renderOnboarding({
        ...freshOnboardingDraft(),
        step: "name",
        name: "Alex",
      });
      await act(() => submitName());
      expect(screen.getByRole("status")).toHaveTextContent(
        en.welcome_audio_error
      );
      expect(
        screen.getByRole("button", { name: en.voice_answer })
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: en.mode_answer_text })
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Skip intro (dev)" })
      ).not.toBeInTheDocument();
    });
    /* oxlint-enable vitest/max-expects */

    it("hides the developer skip in production while the welcome plays", () => {
      vi.stubEnv("DEV", false);
      renderOnboarding({
        ...freshOnboardingDraft(),
        step: "name",
        name: "Alex",
      });
      submitName();
      expect(clips[0]?.play).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("button", { name: "Skip intro (dev)" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: en.voice_listen })
      ).not.toBeInTheDocument();
    });

    it.each(["ended", "text", "voice", "back"] as const)(
      "removes the developer skip after %s",
      async (action) => {
        renderOnboarding({
          ...freshOnboardingDraft(),
          step: "name",
          name: "Alex",
        });
        expect(
          screen.queryByRole("button", { name: "Skip intro (dev)" })
        ).not.toBeInTheDocument();
        submitName();
        expect(
          screen.getByRole("button", { name: "Skip intro (dev)" })
        ).toHaveClass("fixed", "right-4", "bottom-4");
        if (action === "ended") {
          act(() => clips[0].dispatchEvent(new Event("ended")));
        } else {
          const labels = {
            text: en.mode_answer_text,
            voice: en.voice_answer,
            back: en.back_button,
          };
          await userEvent.click(
            screen.getByRole("button", {
              name: labels[action],
            })
          );
        }
        expect(
          screen.queryByRole("button", { name: "Skip intro (dev)" })
        ).not.toBeInTheDocument();
      }
    );

    it.each(["unmount", "pagehide", "hidden"] as const)(
      "stops the welcome on %s without resuming it",
      (event) => {
        const view = renderOnboarding({
          ...freshOnboardingDraft(),
          step: "name",
          name: "Alex",
        });
        submitName();
        const [clip] = clips;
        act(() => {
          if (event === "unmount") {
            view.unmount();
          } else if (event === "pagehide") {
            window.dispatchEvent(new Event("pagehide"));
          } else {
            vi.spyOn(document, "hidden", "get").mockReturnValue(true);
            document.dispatchEvent(new Event("visibilitychange"));
          }
        });
        expect(clip.pause).toHaveBeenCalledOnce();
        act(() => clip.dispatchEvent(new Event("timeupdate")));
        expect(clip.play).toHaveBeenCalledOnce();
      }
    );
  });

  describe("text onboarding with an authorized welcome", () => {
    // Checks the required state at each successive screen in the complete journey.
    /* oxlint-disable vitest/max-expects */
    it.each([
      { language: "English", code: "en", label: "English", copy: en },
      { language: "Japanese", code: "ja", label: "日本語", copy: ja },
      { language: "Filipino", code: "fil", label: "Filipino", copy: fil },
      { language: "Arabic", code: "ar", label: "العربية", copy: ar },
    ] as const)(
      "keeps $language onboarding silent outside the welcome screen",
      async ({ language, code, label, copy }) => {
        const user = userEvent.setup();
        const { complete } = renderOnboarding();
        await user.click(screen.getByRole("radio", { name: label }));
        await user.click(
          screen.getByRole("button", { name: copy.continue_button })
        );
        expect(
          screen.getByRole("textbox", { name: copy.name_label })
        ).toBeEnabled();
        expect(audio).not.toHaveBeenCalled();
        expect(screen.getByRole("main")).toHaveAttribute("lang", code);
        expect(screen.getByRole("main")).toHaveAttribute(
          "dir",
          code === "ar" ? "rtl" : "ltr"
        );
        await user.type(
          screen.getByRole("textbox", { name: copy.name_label }),
          "Alex"
        );
        await user.click(
          screen.getByRole("button", { name: copy.continue_button })
        );
        expect(
          screen.getByRole("button", { name: copy.voice_answer })
        ).toBeEnabled();
        expect(audio).toHaveBeenCalledOnce();
        expect(audio).toHaveBeenCalledWith(
          expect.stringContaining(`/audio/chit/welcome/${code}.mp3`)
        );
        expect(
          screen.queryByRole("button", { name: copy.choose_skills })
        ).not.toBeInTheDocument();
        await user.click(
          screen.getByRole("button", { name: copy.mode_answer_text })
        );
        expect(
          screen.queryByRole("button", { name: copy.choose_skills })
        ).not.toBeInTheDocument();
        await user.type(
          screen.getByRole("textbox", { name: copy.motivation_label }),
          "I want to make friends."
        );
        await user.click(
          screen.getByRole("button", { name: copy.continue_button })
        );
        await screen.findByRole(
          "heading",
          { name: copy.heading_benefits },
          { timeout: 3000 }
        );
        expect(
          screen.getByRole("heading", {
            name: copy.help_start_conversations_title,
          })
        ).toBeInTheDocument();
        await user.click(
          screen.getByRole("button", { name: copy.continue_button })
        );
        expect(screen.getAllByRole("checkbox")).toHaveLength(7);
        expect(
          screen.getByRole("button", { name: copy.start_practice })
        ).toBeDisabled();
        expect(screen.getAllByText(copy.skill_suggested)).toHaveLength(2);
        await user.click(
          screen.getByRole("checkbox", {
            name: copy.skill_smooth_speaking_title,
          })
        );
        await user.click(
          screen.getByRole("checkbox", { name: copy.skill_listening_title })
        );
        await user.click(
          screen.getByRole("checkbox", { name: copy.skill_wit_title })
        );
        expect(
          screen.getByRole("checkbox", {
            name: copy.skill_thinking_on_your_feet_title,
          })
        ).toBeDisabled();
        await user.click(
          screen.getByRole("button", { name: copy.back_button })
        );
        await user.click(
          screen.getByRole("button", { name: copy.continue_button })
        );
        expect(
          screen.getByRole("checkbox", { name: copy.skill_wit_title })
        ).toBeChecked();
        await user.click(
          screen.getByRole("button", { name: copy.start_practice })
        );
        expect(complete).toHaveBeenCalledWith({
          version: 1,
          name: "Alex",
          language,
          motivation: reply.goal,
          skills: ["smooth-speaking", "listening", "wit"],
          goalStatus: "ready",
        });
        expect(audio).toHaveBeenCalledOnce();
        expect(clips[0]?.pause).toHaveBeenCalledOnce();
        expect(liveMocks.sessions).toHaveLength(0);
      },
      10_000
    );
    /* oxlint-enable vitest/max-expects */

    it("rejects whitespace names without hiding the name input", async () => {
      renderOnboarding({ ...freshOnboardingDraft(), step: "name" });
      await userEvent.type(
        screen.getByRole("textbox", { name: en.name_label }),
        "   "
      );
      expect(
        screen.queryByRole("button", { name: en.continue_button })
      ).not.toBeInTheDocument();
      expect(audio).not.toHaveBeenCalled();
    });

    it("sends only an unmodified Enter and leaves typing available after a failed request", async () => {
      fetchRecommendation.mockResolvedValue(
        Response.json({ error: "Offline" }, { status: 503 })
      );
      renderOnboarding(initialText());
      const input = screen.getByRole("textbox", { name: en.motivation_label });
      fireEvent.change(input, { target: { value: "Make friends" } });
      fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      expect(fetchRecommendation).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: "Enter" });
      await screen.findByRole("alert");
      expect(input).toBeEnabled();
      expect(
        screen.getByRole("button", { name: en.mode_switch_voice })
      ).toBeEnabled();
    });
  });

  describe("replacing a goal attempt", () => {
    it("clears typed history, input, outcome, and persisted history across repeated switches", async () => {
      const conversation: OnboardingMessage[] = [
        { role: "user", text: "An old goal" },
        { role: "assistant", text: "Tell me more" },
      ];
      renderOnboarding({
        ...initialText(),
        conversation,
        motivation: "An unfinished answer",
      });
      await userEvent.click(
        screen.getByRole("button", { name: en.mode_switch_voice })
      );
      expect(screen.queryByText("An old goal")).not.toBeInTheDocument();
      expect(readOnboarding().draft).toMatchObject({
        name: "Alex",
        language: "English",
        skills: ["wit"],
        conversation: [],
        conversationMode: "voice",
        motivation: "",
      });
      emitMessages(latestLive(), [{ role: "user", text: "Voice only" }]);
      await userEvent.click(
        screen.getByRole("button", { name: en.mode_switch_text })
      );
      expect(screen.queryByText("Voice only")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: en.motivation_label })
      ).toHaveValue("");
      expect(readOnboarding().draft).toMatchObject({
        conversation: [],
        conversationMode: "text",
        motivation: "",
        skills: ["wit"],
      });
    });

    it("aborts a text request and ignores its late reply after switching", async () => {
      const pending = Promise.withResolvers<Response>();
      fetchRecommendation.mockReturnValue(pending.promise);
      renderOnboarding(initialText());
      submitText("Abandoned goal");
      const signal = fetchRecommendation.mock.calls[0]?.[1]?.signal;
      await userEvent.click(
        screen.getByRole("button", { name: en.mode_switch_voice })
      );
      await act(() => pending.resolve(onboardingTurnResponse(reply)));
      expect(signal?.aborted).toBeTruthy();
      expect(screen.queryByText(reply.reply)).not.toBeInTheDocument();
      expect(readOnboarding().draft.step).toBe("microphone");
      expect(readOnboarding().draft.resolvedGoal).toBeUndefined();
    });

    it("cancels the text reading delay before it can advance a new voice attempt", async () => {
      vi.useFakeTimers();
      renderOnboarding(initialText());
      await act(async () => {
        submitText("Make friends");
        await Promise.resolve();
      });
      fireEvent.click(
        screen.getByRole("button", { name: en.mode_switch_voice })
      );
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(readOnboarding().draft.step).toBe("microphone");
      expect(readOnboarding().draft.goalStatus).toBeUndefined();
    });

    it.each(["connecting", "listening", "thinking", "speaking"] as const)(
      "switches from voice during %s and ignores old callbacks",
      async (phase) => {
        await startVoice();
        const old = latestLive();
        act(() => old.update({ phase }));
        await userEvent.click(
          screen.getByRole("button", { name: en.mode_switch_text })
        );
        emitMessages(old, [{ role: "assistant", text: "Too late" }]);
        act(() => old.update({ phase: "ready", result: reply }));
        expect(old.close).toHaveBeenCalledOnce();
        expect(screen.queryByText("Too late")).not.toBeInTheDocument();
        expect(readOnboarding().draft).toMatchObject({
          step: "motivation",
          conversation: [],
          motivation: "",
        });
      }
    );

    it("cancels and removes only the old attempt's recommendations", async () => {
      const pending = Promise.withResolvers<Response>();
      fetchRecommendation.mockReturnValue(pending.promise);
      const { client } = renderOnboarding({
        ...initialText(),
        step: "benefits",
        motivation: "Old goal",
        goalStatus: "ready",
      });
      client.setQueryData(["unrelated"], "keep me");
      const signal = fetchRecommendation.mock.calls[0]?.[1]?.signal;
      await userEvent.click(
        screen.getByRole("button", { name: en.back_button })
      );
      await userEvent.click(
        screen.getByRole("button", { name: en.mode_switch_voice })
      );
      await act(() =>
        pending.resolve(
          Response.json({
            acknowledgment: "Abandoned",
            suggestedSkills: ["listening"],
            benefits: reply.benefits,
          })
        )
      );
      expect(signal?.aborted).toBeTruthy();
      expect(client.getQueryData(["unrelated"])).toBe("keep me");
      expect(
        client
          .getQueryCache()
          .findAll({ queryKey: ["onboarding-recommendation"] })
          .every((query) => query.state.data === undefined)
      ).toBeTruthy();
      expect(readOnboarding().draft.resolvedGoal).toBeUndefined();
    });
  });

  describe("incremental text replies", () => {
    it("renders without moving focus or saving partial output and announces only the final reply", async () => {
      vi.useFakeTimers();
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      });
      fetchRecommendation.mockResolvedValueOnce(
        new Response(body, {
          headers: { "Content-Type": "application/x-ndjson" },
        })
      );
      renderOnboarding(initialText());
      await act(() => submitText("Make friends"));
      const focused = document.activeElement;
      await act(() =>
        controller.enqueue(
          new TextEncoder().encode(
            '{"type":"reply","reply":"We can practice"}\n'
          )
        )
      );
      expect(screen.getByRole("log")).toHaveTextContent("We can practice");
      expect({
        live: screen.getByRole("log").getAttribute("aria-live"),
        announcement: screen.getByRole("status").textContent,
        focus: document.activeElement === focused,
        resolved: readOnboarding().draft.resolvedGoal,
        conversation: readOnboarding().draft.conversation,
      }).toStrictEqual({
        live: "off",
        announcement: "",
        focus: true,
        resolved: undefined,
        conversation: undefined,
      });
      await act(() => {
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "complete", turn: reply })}\n`
          )
        );
        controller.close();
      });
      expect(screen.getByRole("status")).toHaveTextContent(reply.reply);
      expect(readOnboarding().draft.resolvedGoal).toStrictEqual(reply);
      await act(() => vi.advanceTimersByTimeAsync(1800));
      expect(
        screen.getByRole("heading", { name: en.heading_benefits })
      ).toBeInTheDocument();
    });
  });

  describe("Gemini voice and its transcript", () => {
    it("pauses and resumes microphone capture without resetting the voice conversation", async () => {
      await startVoice();
      const live = latestLive();
      act(() => live.update({ phase: "listening" }));
      emitMessages(live, [{ role: "user", text: "Make friends" }]);
      await userEvent.click(
        screen.getByRole("button", {
          name: `${en.voice_listening}. ${en.voice_show_transcript}`,
        })
      );
      expect(live.pause).toHaveBeenCalledOnce();
      expect(screen.getByRole("log")).toHaveTextContent("Make friends");
      await userEvent.click(
        screen.getByRole("button", { name: en.voice_back })
      );
      expect(live.resume).toHaveBeenCalledOnce();
      expect(live.close).not.toHaveBeenCalled();
      expect(liveMocks.sessions).toHaveLength(1);
    });

    it("shows no canned assistant reply before native audio and advances only on a ready result", async () => {
      await startVoice();
      expect(
        screen.queryByText(en.welcome_body, { exact: false })
      ).not.toBeInTheDocument();
      const live = latestLive();
      act(() => live.update({ phase: "speaking" }));
      emitMessages(live, [{ role: "assistant", text: reply.reply }]);
      expect(readOnboarding().draft.step).toBe("microphone");
      await act(() => live.update({ phase: "ready", result: reply }));
      expect(
        screen.getByRole("heading", { name: en.heading_benefits })
      ).toBeInTheDocument();
      expect(readOnboarding().draft.resolvedGoal).toStrictEqual(reply);
    });

    it("holds navigation while viewing the transcript and continues with the confirmed result", async () => {
      await startVoice();
      const live = latestLive();
      await userEvent.click(
        screen.getByRole("button", {
          name: `${en.voice_connecting}. ${en.voice_show_transcript}`,
        })
      );
      act(() => live.update({ phase: "ready", result: reply }));
      expect(readOnboarding().draft.step).toBe("benefits");
      await userEvent.click(
        screen.getByRole("button", { name: en.continue_button })
      );
      expect(readOnboarding().draft.step).toBe("benefits");
    });

    it("offers fresh restart and text without a skip after a voice error", async () => {
      await startVoice();
      const first = latestLive();
      emitMessages(first, [{ role: "user", text: "Discard on restart" }]);
      act(() => first.update({ phase: "idle", error: "Could not connect" }));
      expect(
        screen.getByRole("button", { name: en.mode_switch_text })
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: en.choose_skills })
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: en.voice_restart })
      );
      expect(first.close).toHaveBeenCalledOnce();
      expect(liveMocks.sessions).toHaveLength(2);
      expect(readOnboarding().draft.conversation).toStrictEqual([]);
    });

    it("requires an explicit restart after a voice draft is restored", async () => {
      localStorage.setItem(
        "chitchat.onboarding.draft.v1",
        JSON.stringify({
          ...initialText(),
          step: "microphone",
          conversationMode: "voice",
          conversation: [{ role: "user", text: "Previous voice" }],
        })
      );
      renderOnboarding(readOnboarding().draft);
      expect(liveMocks.sessions).toHaveLength(0);
      expect(screen.queryByText("Previous voice")).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: en.voice_restart })
      );
      expect(liveMocks.sessions).toHaveLength(1);
    });
  });

  describe("goal completion and persistence", () => {
    it("preserves legacy skill selection across reload, final save, and profile editing", async () => {
      const first = renderOnboarding({
        ...initialText(),
        step: "skills",
        goalStatus: "choose",
      });
      const { draft } = readOnboarding();
      first.unmount();
      const restored = renderOnboarding(draft);
      await userEvent.click(
        screen.getByRole("button", { name: en.start_practice })
      );
      const profile = restored.complete.mock.calls[0]?.[0];
      expect(profile).toMatchObject({
        goalStatus: "choose",
        motivation: "",
        skills: ["wit"],
      });
      if (!profile) {
        throw new Error("No profile saved");
      }
      saveOnboardingProfile(profile);
      restored.unmount();
      const saved = readOnboarding().profile;
      if (!saved) {
        throw new Error("No saved profile");
      }
      const edit = renderOnboarding({ ...saved, step: "skills" }, true);
      await userEvent.click(
        screen.getByRole("button", { name: en.save_goals })
      );
      expect(edit.complete).toHaveBeenCalledWith(profile);
      expect(fetchRecommendation).not.toHaveBeenCalled();
    });

    it("restores a confirmed text result during its reading delay", async () => {
      vi.useFakeTimers();
      const first = renderOnboarding(initialText());
      await act(async () => {
        submitText("Make friends");
        await Promise.resolve();
      });
      expect(
        screen.getByRole("textbox", { name: en.motivation_label })
      ).toBeInTheDocument();
      const restored = readOnboarding().draft;
      first.unmount();
      renderOnboarding(restored);
      expect(
        screen.getByRole("heading", { name: en.heading_benefits })
      ).toBeInTheDocument();
      expect(restored.resolvedGoal).toStrictEqual(reply);
    });

    it("restores confirmed voice benefits without a second recommendation request", () => {
      renderOnboarding({
        ...initialText(),
        step: "benefits",
        conversationMode: "voice",
        goalStatus: "ready",
        motivation: reply.goal,
        resolvedGoal: reply,
      });
      expect(
        screen.getByRole("heading", { name: en.help_start_conversations_title })
      ).toBeInTheDocument();
      expect(fetchRecommendation).not.toHaveBeenCalled();
      expect(liveMocks.sessions).toHaveLength(0);
    });

    it("keeps Continue usable while restored benefit recommendations are pending", async () => {
      fetchRecommendation.mockReturnValue(
        Promise.withResolvers<Response>().promise
      );
      renderOnboarding({
        ...initialText(),
        step: "benefits",
        motivation: "Make friends",
      });
      expect(screen.getByRole("status")).toHaveTextContent(en.help_loading);
      await userEvent.click(
        screen.getByRole("button", { name: en.continue_button })
      );
      expect(
        screen.getByRole("heading", { name: en.heading_skills })
      ).toBeInTheDocument();
    });

    it("shows neutral benefits and keeps manual skill selection available if recommendations fail", async () => {
      fetchRecommendation.mockResolvedValue(
        Response.json({ error: "Unavailable" }, { status: 503 })
      );
      renderOnboarding({
        ...initialText(),
        step: "benefits",
        motivation: "Make friends",
      });
      await screen.findByText(en.help_fallback);
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
      await userEvent.click(
        screen.getByRole("button", { name: en.continue_button })
      );
      expect(
        screen.getByRole("checkbox", { name: en.skill_wit_title })
      ).toBeChecked();
    });

    it("continues when browser storage is unavailable", async () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Blocked");
      });
      const { complete } = renderOnboarding(initialText());
      await userEvent.type(
        screen.getByRole("textbox", { name: en.motivation_label }),
        "Make friends"
      );
      await userEvent.click(
        screen.getByRole("button", { name: en.continue_button })
      );
      await screen.findByRole(
        "heading",
        { name: en.heading_benefits },
        { timeout: 3000 }
      );
      await userEvent.click(
        screen.getByRole("button", { name: en.continue_button })
      );
      await userEvent.click(
        screen.getByRole("button", { name: en.start_practice })
      );
      expect(complete).toHaveBeenCalledOnce();
      expect(screen.getByText(en.progress_error)).toBeInTheDocument();
    });
  });
});
