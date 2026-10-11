import { practiceLanguageLocales } from "@chitchat/contracts/languages";
import {
  defaultOnboardingBenefits,
  onboardingProfileSchema,
  onboardingSteps,
} from "@chitchat/contracts/onboarding";
import type {
  OnboardingDraft,
  OnboardingProfile,
  OnboardingRecommendation,
  OnboardingStep,
  OnboardingTurn,
} from "@chitchat/contracts/onboarding";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Direction } from "radix-ui";
import type { Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChitAvatar } from "@/components/ui/chit-avatar";
import {
  OnboardingLocaleContext,
  useOnboardingLocale,
} from "@/lib/onboarding-locale";
import { saveOnboardingDraft } from "@/lib/onboarding-storage";
import { onboardingRecommendationQuery } from "@/lib/practice-api";
import { m } from "@/paraglide/messages";
import { getTextDirection } from "@/paraglide/runtime";

import { OnboardingBenefits } from "./onboarding-benefits";
import { OnboardingLanguages, OnboardingSkills } from "./onboarding-choices";
import {
  OnboardingGoalStatus,
  OnboardingMicrophone,
  OnboardingModeChoices,
  OnboardingModeSwitch,
  OnboardingMotivation,
} from "./onboarding-conversation";
import {
  getIntroduction,
  OnboardingName,
  OnboardingNameContinue,
  OnboardingWelcome,
  useOnboardingIntroduction,
} from "./onboarding-introduction";
import { useOnboardingGoal } from "./use-onboarding-goal";

import "./onboarding.css";

const headings = {
  language: m.heading_language,
  name: m.heading_name,
  microphone: m.heading_microphone,
  motivation: m.heading_motivation,
  benefits: m.heading_benefits,
  skills: m.heading_skills,
};

const headingSizes: Record<OnboardingStep, string> = {
  language: "text-2xl leading-tight font-medium tracking-[-0.03em] sm:text-3xl",
  name: "text-3xl leading-tight font-medium tracking-[-0.03em] sm:text-4xl",
  microphone: "text-base font-normal leading-relaxed tracking-normal",
  motivation:
    "text-3xl leading-tight font-medium tracking-[-0.03em] sm:text-4xl",
  benefits: "text-3xl leading-tight font-medium tracking-[-0.03em] sm:text-4xl",
  skills: "text-3xl leading-tight font-medium tracking-[-0.03em] sm:text-4xl",
};

function OnboardingHeader({
  draft,
  voiceScreen,
  heading,
  welcome,
}: {
  draft: OnboardingDraft;
  voiceScreen: boolean;
  heading: Ref<HTMLHeadingElement>;
  welcome: ReturnType<typeof useOnboardingIntroduction>;
}) {
  const locale = useOnboardingLocale();
  return (
    <>
      {" "}
      {draft.step !== "name" && draft.step !== "motivation" && !voiceScreen && (
        <div className="mb-7 shrink-0 text-center">
          {draft.step !== "microphone" && (
            <ChitAvatar size={80} className="mb-4" />
          )}
          {draft.step === "microphone" ? (
            <>
              <OnboardingWelcome
                speaking={welcome.speaking}
                revealedWords={welcome.revealedWords}
                headingRef={heading}
              />
              {welcome.unavailable && (
                <output className="text-muted-foreground mt-2 block text-sm">
                  {m.welcome_audio_error({}, { locale })}
                </output>
              )}
            </>
          ) : (
            <h1
              ref={heading}
              tabIndex={-1}
              className={`mx-auto max-w-xl text-pretty outline-none ${headingSizes[draft.step]}`}
            >
              {headings[draft.step]({}, { locale })}
            </h1>
          )}
        </div>
      )}
    </>
  );
}
function OnboardingFooter({
  draft,
  canSave,
  onCancel,
  onComplete,
  next,
  stopGoal,
}: {
  draft: OnboardingDraft;
  canSave: boolean;
  onCancel?: () => void;
  onComplete: (profile: OnboardingProfile) => void;
  next: () => void;
  stopGoal: () => void;
}) {
  const locale = useOnboardingLocale();
  const finishLabel = onCancel
    ? m.save_goals({}, { locale })
    : m.start_practice({}, { locale });
  const ownAction = ["name", "microphone", "motivation"].includes(draft.step);
  return (
    <footer className="bg-background/95 sticky bottom-0 flex flex-col items-center gap-3 py-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg items-center gap-3">
        {draft.step === "name" && (
          <OnboardingNameContinue name={draft.name} speaking={false} />
        )}
        {!ownAction && (
          <Button
            className="onboarding-action ms-auto flex-1 rounded-full"
            disabled={draft.step === "skills" && draft.skills.length === 0}
            onClick={() => {
              if (draft.step === "skills") {
                const parsed = onboardingProfileSchema.safeParse(draft);
                if (parsed.success) {
                  return onComplete(parsed.data);
                }
              } else {
                return next();
              }
            }}
          >
            {draft.step === "skills"
              ? finishLabel
              : m.continue_button({}, { locale })}
          </Button>
        )}
      </div>
      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            stopGoal();
            onCancel();
          }}
        >
          {m.cancel_button({}, { locale })}
        </Button>
      )}
      {!canSave && (
        <output className="text-muted-foreground text-center text-xs">
          {m.progress_error({}, { locale })}
        </output>
      )}
    </footer>
  );
}

function shouldRecommend(
  draft: OnboardingDraft,
  resolved: OnboardingTurn | null
) {
  return (
    draft.goalStatus !== "choose" &&
    (!resolved || (resolved.status === "ready" && !resolved.benefits)) &&
    (draft.step === "benefits" || draft.step === "skills") &&
    Boolean(draft.name.trim() && draft.motivation.trim())
  );
}

function selectedBenefits(
  resolved: OnboardingTurn | null,
  recommendation: OnboardingRecommendation | undefined
) {
  return resolved?.benefits ?? recommendation?.benefits;
}

function benefitStatus(pending: boolean, personalized: boolean) {
  if (pending) {
    return m.help_loading;
  }
  return personalized ? m.help_personalized : m.help_fallback;
}

export function Onboarding({
  initial,
  onComplete,
  onCancel,
}: {
  initial: OnboardingDraft;
  onComplete: (profile: OnboardingProfile) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const welcome = useOnboardingIntroduction();
  const sessionId = useId();
  const attempt = useRef(0);
  const [draft, setDraft] = useState(initial);
  const currentDraft = useRef(initial);
  const [voiceStarted, setVoiceStarted] = useState(false);
  const [attemptId, setAttemptId] = useState(0);
  const locale = practiceLanguageLocales[draft.language];
  const [canSave, setCanSave] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const index = onboardingSteps.indexOf(draft.step);
  const [resolved, setResolved] = useState<OnboardingTurn | null>(
    initial.resolvedGoal ?? null
  );
  const answer = useRef(initial.motivation);
  function commitDraft(changes: Partial<OnboardingDraft>) {
    const nextDraft = { ...currentDraft.current, ...changes };
    currentDraft.current = nextDraft;
    setDraft(nextDraft);
    if (!onCancel) {
      setCanSave(saveOnboardingDraft(nextDraft));
    }
  }
  function acceptGoal(turn: OnboardingTurn) {
    if (attempt.current !== attemptId || turn.status === "clarify") {
      return;
    }
    setResolved(turn);
    commitDraft({
      goalStatus: turn.status === "choose" ? "choose" : "ready",
      resolvedGoal: turn,
      motivation: turn.goal,
    });
  }
  function advanceGoal(turn: OnboardingTurn) {
    if (attempt.current !== attemptId || turn.status === "clarify") {
      return;
    }
    commitDraft({ step: turn.status === "choose" ? "skills" : "benefits" });
  }
  const goal = useOnboardingGoal({
    initialMessages:
      initial.conversationMode === "text" ? (initial.conversation ?? []) : [],
    name: draft.name.trim(),
    language: draft.language,
    onReply: (conversation, turn) => {
      if (attempt.current !== attemptId) {
        return;
      }
      answer.current = "";
      commitDraft({
        conversation,
        motivation: "",
        // The reply is confirmed even while its reading delay is running.
        resolvedGoal: turn.status === "clarify" ? undefined : turn,
        goalStatus: turn.status === "clarify" ? undefined : turn.status,
      });
      acceptGoal(turn);
    },
    onReady: advanceGoal,
  });
  const recommendationOptions = onboardingRecommendationQuery({
    name: draft.name.trim(),
    motivation: draft.motivation.trim(),
    conversation:
      draft.conversationMode === "voice" ? undefined : draft.conversation,
    goalStatus: draft.goalStatus,
    language: draft.language,
  });
  const recommendation = useQuery({
    ...recommendationOptions,
    queryKey: [
      "onboarding-recommendation",
      sessionId,
      String(attemptId),
      ...recommendationOptions.queryKey,
    ],
    enabled: shouldRecommend(draft, resolved),
  });
  useEffect(() => {
    if (!onCancel) {
      // oxlint-disable-next-line react/set-state-in-effect
      setCanSave(saveOnboardingDraft(currentDraft.current));
    }
  }, [currentDraft, onCancel]);
  useEffect(() => {
    if (!draft.step) {
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [draft.step]);

  function stopAttempt() {
    welcome.stop();
    const oldAttempt = attempt.current;
    attempt.current += 1;
    setAttemptId(attempt.current);
    goal.reset();
    const queryKey = [
      "onboarding-recommendation",
      sessionId,
      String(oldAttempt),
    ];
    void queryClient.cancelQueries({ queryKey });
    queryClient.removeQueries({ queryKey });
  }
  function replaceAttempt(
    changes: Partial<OnboardingDraft>,
    startVoice = false
  ) {
    stopAttempt();
    setResolved(null);
    answer.current = "";
    setVoiceStarted(startVoice);
    const nextDraft: OnboardingDraft = {
      ...currentDraft.current,
      conversation: [],
      conversationMode: undefined,
      motivation: "",
      goalStatus: undefined,
      resolvedGoal: undefined,
      ...changes,
    };
    commitDraft(nextDraft);
  }
  function switchMode(mode: "text" | "voice") {
    replaceAttempt(
      {
        step: mode === "voice" ? "microphone" : "motivation",
        conversationMode: mode,
      },
      mode === "voice"
    );
  }
  function update(changes: Partial<OnboardingDraft>) {
    if (changes.motivation !== undefined) {
      answer.current = changes.motivation;
    }
    commitDraft(changes);
  }
  function next() {
    update({ step: onboardingSteps[index + 1] });
  }
  function back() {
    if (draft.step === "skills" && draft.goalStatus !== "choose") {
      update({ step: "benefits" });
    } else if (draft.step === "benefits") {
      replaceAttempt({
        step: draft.conversationMode === "voice" ? "microphone" : "motivation",
        conversationMode: draft.conversationMode ?? "text",
      });
    } else if (draft.step === "name") {
      replaceAttempt({ step: "language" });
    } else if (draft.step === "microphone") {
      replaceAttempt({ step: "name" });
    } else {
      replaceAttempt({ step: "microphone" });
    }
  }
  const typingBusy = goal.phase !== "idle";
  const voiceScreen = draft.step === "microphone" && voiceStarted;
  const suggestedSkills =
    resolved?.suggestedSkills ?? recommendation.data?.suggestedSkills ?? [];
  const acknowledgment =
    resolved?.reply ??
    recommendation.data?.acknowledgment ??
    m.benefits_fallback({}, { locale });
  const benefits = selectedBenefits(resolved, recommendation.data);
  const benefitsPending = !benefits && recommendation.isFetching;
  function content() {
    switch (draft.step) {
      case "language": {
        return (
          <OnboardingLanguages
            value={draft.language}
            onChange={(language) => update({ language })}
          />
        );
      }
      case "name": {
        return (
          <OnboardingName
            language={draft.language}
            name={draft.name}
            speaking={false}
            revealedWords={0}
            unavailable={false}
            getAnalyser={() => null}
            headingRef={heading}
            onChange={(name) => update({ name })}
            onSubmit={() => {
              void welcome.playWelcome(draft.language);
              update({ name: draft.name.trim(), step: "microphone" });
            }}
          />
        );
      }
      case "microphone": {
        if (!voiceStarted) {
          return (
            <OnboardingModeChoices
              restart={draft.conversationMode === "voice"}
              onVoice={() => switchMode("voice")}
              onText={() => switchMode("text")}
            />
          );
        }
        return (
          <OnboardingMicrophone
            key={attemptId}
            name={draft.name}
            language={draft.language}
            onMessages={(conversation) => {
              if (attempt.current === attemptId) {
                commitDraft({ conversation });
              }
            }}
            onResolved={acceptGoal}
            onReady={advanceGoal}
            onRestart={() => switchMode("voice")}
            onSwitch={() => switchMode("text")}
          />
        );
      }
      case "motivation": {
        return (
          <>
            <OnboardingMotivation
              name={draft.name}
              value={draft.motivation}
              introduction={getIntroduction(draft.language).text}
              onChange={(motivation) => update({ motivation })}
              messages={goal.messages}
              busy={typingBusy}
              onContinue={() => {
                void goal.submit(answer.current);
              }}
            />
            <OnboardingGoalStatus goal={goal} />
            <OnboardingModeSwitch
              mode="text"
              onSwitch={() => switchMode("voice")}
            />
          </>
        );
      }
      case "benefits": {
        return (
          <>
            <p
              className="text-muted-foreground mx-auto mb-7 max-w-lg text-center text-base leading-relaxed"
              aria-live="polite"
            >
              {acknowledgment}
            </p>
            <output className="text-muted-foreground mb-4 text-center text-sm">
              {benefitStatus(benefitsPending, Boolean(benefits?.personalized))(
                {},
                { locale }
              )}
            </output>
            {!benefitsPending && (
              <OnboardingBenefits
                ids={benefits?.ids ?? defaultOnboardingBenefits}
              />
            )}
            <p className="text-muted-foreground mt-6 text-center text-sm">
              {m.benefits_pace({}, { locale })}
            </p>
          </>
        );
      }
      case "skills": {
        return (
          <>
            <p className="text-muted-foreground mb-6 text-center text-base">
              {m.skills_hint({}, { locale })}
            </p>
            {recommendation.isFetching && (
              <output className="text-muted-foreground mb-3 text-center text-sm">
                {m.suggestions_loading({}, { locale })}
              </output>
            )}
            {recommendation.isError && (
              <output className="text-muted-foreground mb-3 text-center text-sm">
                {m.suggestions_error({}, { locale })}
              </output>
            )}
            <OnboardingSkills
              value={draft.skills}
              suggested={suggestedSkills}
              onChange={(skills) => update({ skills })}
            />
          </>
        );
      }
      default: {
        return null;
      }
    }
  }
  return (
    <OnboardingLocaleContext value={locale}>
      <Direction.Provider dir={getTextDirection(locale)}>
        <main
          lang={locale}
          dir={getTextDirection(locale)}
          id="main"
          data-voice-step={voiceScreen ? "true" : undefined}
          data-chat-step={draft.step === "motivation" ? "true" : undefined}
          data-language-step={draft.step === "language" ? "true" : undefined}
          className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-5 sm:px-8"
        >
          {index > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute end-5 top-4 z-10 rounded-full sm:end-8"
              aria-label={m.back_button({}, { locale })}
              onClick={back}
            >
              <X aria-hidden="true" />
            </Button>
          )}
          <div className="onboarding-content flex flex-1 flex-col justify-center py-8 sm:py-12">
            <OnboardingHeader
              draft={draft}
              voiceScreen={voiceScreen}
              heading={heading}
              welcome={welcome}
            />
            {content()}
          </div>
          <OnboardingFooter
            draft={draft}
            canSave={canSave}
            onCancel={onCancel}
            onComplete={onComplete}
            next={next}
            stopGoal={stopAttempt}
          />
          {import.meta.env.DEV &&
            draft.step === "microphone" &&
            !voiceScreen &&
            welcome.speaking && (
              <Button
                variant="outline"
                size="sm"
                className="bg-background fixed right-4 bottom-4 z-20 rounded-full shadow-sm"
                onClick={() => {
                  welcome.stop();
                  heading.current?.focus({ preventScroll: true });
                }}
              >
                Skip intro (dev)
              </Button>
            )}
        </main>
      </Direction.Provider>
    </OnboardingLocaleContext>
  );
}
