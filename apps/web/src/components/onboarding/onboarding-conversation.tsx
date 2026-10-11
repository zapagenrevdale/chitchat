import type { PracticeLanguage } from "@chitchat/contracts";
import type {
  OnboardingMessage,
  OnboardingTurn,
} from "@chitchat/contracts/onboarding";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ConversationMessage } from "@/components/practice/practice-conversation";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/ui/chat-input";
import { ChitAvatar } from "@/components/ui/chit-avatar";
import { WatercolorWave } from "@/components/ui/watercolor-wave";
import { useOnboardingLocale } from "@/lib/onboarding-locale";
import { m } from "@/paraglide/messages";

import type { useOnboardingGoal } from "./use-onboarding-goal";
import { useOnboardingLive } from "./use-onboarding-live";

const emptyMessages: OnboardingMessage[] = [];

export function OnboardingModeSwitch({
  mode,
  onSwitch,
}: {
  mode: "text" | "voice";
  onSwitch: () => void;
}) {
  const locale = useOnboardingLocale();
  return (
    <div className="shrink-0 text-center">
      <Button variant="link" onClick={onSwitch}>
        {mode === "voice"
          ? m.mode_switch_text({}, { locale })
          : m.mode_switch_voice({}, { locale })}
      </Button>
    </div>
  );
}

export function OnboardingModeChoices({
  restart,
  onVoice,
  onText,
}: {
  restart: boolean;
  onVoice: () => void;
  onText: () => void;
}) {
  const locale = useOnboardingLocale();
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-3 text-center">
      <Button size="lg" className="w-full whitespace-normal" onClick={onVoice}>
        {restart
          ? m.voice_restart({}, { locale })
          : m.voice_answer({}, { locale })}
      </Button>
      <Button
        variant="secondary"
        className="w-full whitespace-normal"
        onClick={onText}
      >
        {m.mode_answer_text({}, { locale })}
      </Button>
      {restart && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {m.mode_switch_hint({}, { locale })}
        </p>
      )}
    </div>
  );
}

export function OnboardingGoalStatus({
  goal,
}: {
  goal: ReturnType<typeof useOnboardingGoal>;
}) {
  const locale = useOnboardingLocale();
  return (
    <div className="mx-auto mt-4 flex w-full max-w-xl shrink-0 flex-col items-center gap-3">
      {goal.phase === "thinking" && <ChitAvatar size={48} state="thinking" />}
      <output className="sr-only">{goal.result?.reply}</output>
      {goal.error && (
        <p role="alert" className="text-destructive text-center text-sm">
          {m.suggestions_error({}, { locale })}
        </p>
      )}
    </div>
  );
}

function OnboardingTranscriptMessages({
  name = "",
  introduction,
  messages = emptyMessages,
}: {
  messages?: (OnboardingMessage & { id?: number })[];
  name?: string;
  introduction?: string;
}) {
  const locale = useOnboardingLocale();
  return (
    <>
      {introduction && (
        <>
          <ConversationMessage
            transcriptId="onboarding-transcript"
            name="Chit"
            avatar={<ChitAvatar size={32} />}
            message={{ id: 1, speaker: "partner", text: introduction }}
          />
          <ConversationMessage
            transcriptId="onboarding-transcript"
            name="Chit"
            message={{ id: 2, speaker: "user", text: name }}
          />
          <ConversationMessage
            transcriptId="onboarding-transcript"
            name="Chit"
            avatar={<ChitAvatar size={32} />}
            message={{
              id: 3,
              speaker: "partner",
              text: `${m.welcome_name({ name }, { locale })} ${m.welcome_body({}, { locale })}`,
            }}
          />
        </>
      )}
      {messages.map((message, index) => (
        <ConversationMessage
          key={message.id ?? index}
          transcriptId="onboarding-transcript"
          name="Chit"
          avatar={
            message.role === "assistant" ? <ChitAvatar size={32} /> : undefined
          }
          message={{
            id: message.id ?? index + 4,
            speaker: message.role === "assistant" ? "partner" : "user",
            text: message.text,
          }}
        />
      ))}
    </>
  );
}

function VoiceTranscript({
  messages,
  id,
}: {
  messages: OnboardingMessage[];
  id: string;
}) {
  const locale = useOnboardingLocale();
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (log.current && follow.current) {
      log.current.scrollTop = log.current.scrollHeight;
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Follow new transcript content.
  }, [messages]);
  return (
    <div
      id={id}
      ref={log}
      role="log"
      // Voice supplies response audio; avoid duplicating incremental speech.
      aria-live="off"
      aria-label={m.voice_show_transcript({}, { locale })}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard scrolling.
      tabIndex={0}
      onScroll={(event) => {
        const node = event.currentTarget;
        follow.current =
          node.scrollHeight - node.scrollTop - node.clientHeight < 32;
      }}
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-2"
    >
      <OnboardingTranscriptMessages messages={messages} />
    </div>
  );
}

function lastReply(messages: OnboardingMessage[]) {
  let reply: string | undefined;
  for (const message of messages) {
    if (message.role === "assistant") {
      reply = message.text;
    }
  }
  return reply;
}

export function OnboardingMicrophone({
  name,
  language,
  onMessages,
  onResolved,
  onReady,
  onRestart,
  onSwitch,
}: {
  name: string;
  language: PracticeLanguage;
  onMessages: (messages: OnboardingMessage[]) => void;
  onResolved: (turn: OnboardingTurn & { status: "ready" | "choose" }) => void;
  onReady: (turn: OnboardingTurn) => void;
  onRestart: () => void;
  onSwitch: () => void;
}) {
  const locale = useOnboardingLocale();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcriptId = useId();
  const submitted = useRef<OnboardingTurn | null>(null);
  const live = useOnboardingLive({
    name,
    language,
    onMessages,
    onResolved,
    autoStart: true,
  });
  useEffect(() => {
    if (
      live.phase === "ready" &&
      live.result &&
      !transcriptOpen &&
      submitted.current !== live.result
    ) {
      submitted.current = live.result;
      onReady(live.result);
    }
  }, [live.phase, live.result, onReady, transcriptOpen]);
  const status = {
    connecting: m.voice_connecting,
    listening: m.voice_listening,
    thinking: m.voice_thinking,
    speaking: m.voice_speaking,
    ready: m.voice_ready,
    idle: m.voice_paused,
    interrupted: m.voice_paused,
  }[live.phase]({}, { locale });
  const avatarState = {
    connecting: "thinking",
    listening: "listening",
    thinking: "thinking",
    speaking: "speaking",
    ready: "idle",
    idle: "idle",
    interrupted: "idle",
  }[live.phase] as "thinking" | "listening" | "speaking" | "idle";
  const reply = lastReply(live.messages);
  const latest = live.messages.at(-1);
  const draft = latest?.role === "user" ? latest.text : "";
  return (
    <section
      aria-label={m.voice_answer({}, { locale })}
      data-voice-session
      className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col pb-40"
    >
      <div className="min-h-0 flex-1">
        {transcriptOpen ? (
          <VoiceTranscript id={transcriptId} messages={live.messages} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-2 text-center">
            <ChitAvatar
              size={80}
              state={avatarState}
              getAnalyser={() => live.getAnalyser() ?? null}
            />
            {reply && (
              <p className="text-xl leading-relaxed" aria-live="off">
                {reply}
              </p>
            )}
            <p
              className="text-muted-foreground min-h-12 text-base leading-relaxed"
              aria-live="off"
            >
              {draft}
            </p>
          </div>
        )}
      </div>
      <div className="shrink-0 text-center text-sm" aria-live="polite">
        {transcriptOpen && (
          <p className="text-muted-foreground">
            {m.voice_transcript_paused({}, { locale })}
          </p>
        )}
        {live.error && (
          <p role="alert" className="text-destructive">
            {live.error}
          </p>
        )}
        {live.phase === "ready" && live.result && (
          <Button
            className="mt-2"
            onClick={() => {
              if (live.result) {
                onReady(live.result);
              }
            }}
          >
            {m.continue_button({}, { locale })}
          </Button>
        )}
        {(live.error || live.phase === "interrupted") && (
          <Button className="mt-2" onClick={onRestart}>
            {m.voice_restart({}, { locale })}
          </Button>
        )}
      </div>
      <OnboardingModeSwitch mode="voice" onSwitch={onSwitch} />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-40 overflow-hidden">
        <WatercolorWave
          active={live.phase === "listening" && !transcriptOpen}
          getLevel={live.getInputVolume}
        />
        <Button
          variant="ghost"
          size="xs"
          className="text-primary pointer-events-auto absolute bottom-10 left-1/2 h-auto -translate-x-1/2 flex-col gap-1 bg-transparent px-2 py-1 font-medium hover:bg-transparent dark:hover:bg-transparent"
          aria-label={
            transcriptOpen
              ? m.voice_back({}, { locale })
              : `${status}. ${m.voice_show_transcript({}, { locale })}`
          }
          aria-expanded={transcriptOpen}
          aria-controls={transcriptOpen ? transcriptId : undefined}
          onClick={() => {
            if (transcriptOpen) {
              live.resume();
            } else {
              live.pause();
            }
            setTranscriptOpen(!transcriptOpen);
          }}
        >
          {transcriptOpen ? (
            <ChevronDown aria-hidden="true" className="size-5" />
          ) : (
            <ChevronUp aria-hidden="true" className="size-5" />
          )}
          <span aria-live="polite">
            {transcriptOpen ? m.voice_back({}, { locale }) : status}
          </span>
        </Button>
      </div>
    </section>
  );
}

export function OnboardingMotivation({
  name,
  introduction,
  value,
  onChange,
  onContinue,
  messages = emptyMessages,
  busy = false,
}: {
  messages?: OnboardingMessage[];
  busy?: boolean;
  name: string;
  introduction: string;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}) {
  const locale = useOnboardingLocale();
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (messages.length && log.current) {
      log.current.scrollTop = log.current.scrollHeight;
    }
  }, [messages]);
  useEffect(() => {
    if (!busy) {
      input.current?.focus({ preventScroll: true });
    }
  }, [busy]);
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
      <h1 className="sr-only">{m.heading_motivation({}, { locale })}</h1>
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6"
        ref={log}
        role="log"
        aria-live="off"
        aria-label={m.voice_show_transcript({}, { locale })}
      >
        <OnboardingTranscriptMessages
          name={name}
          introduction={introduction}
          messages={messages}
        />
      </div>
      <div className="bg-background shrink-0 pt-3 pb-1">
        <ChatInput
          inputRef={input}
          disabled={busy}
          value={value}
          onChange={onChange}
          onSend={onContinue}
          label={m.motivation_label({}, { locale })}
          placeholder={m.motivation_placeholder({}, { locale })}
          sendLabel={m.continue_button({}, { locale })}
          maxLength={500}
        />
      </div>
    </div>
  );
}
