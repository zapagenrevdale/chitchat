import type { PracticeLanguage } from "@chitchat/contracts";
import type {
  OnboardingMessage,
  OnboardingTurn,
} from "@chitchat/contracts/onboarding";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ChatInput } from "@/components/chat/chat-input";
import { ConversationMessage } from "@/components/chat/conversation-message";
import { Button } from "@/components/ui/button";
import { ChitAvatar } from "@/components/ui/chit-avatar";
import { WatercolorWave } from "@/components/ui/watercolor-wave";
import { useOnboardingLocale } from "@/lib/onboarding-locale";
import { m } from "@/paraglide/messages";

import type { useOnboardingGoal } from "./use-onboarding-goal";
import { useOnboardingLive } from "./use-onboarding-live";

const emptyMessages: OnboardingMessage[] = [];

export function OnboardingModeChoices({
  ready = true,
  restart,
  onVoice,
  onText,
}: {
  ready?: boolean;
  restart: boolean;
  onVoice: () => void;
  onText: () => void;
}) {
  const locale = useOnboardingLocale();
  const labelId = useId();
  return (
    <fieldset
      aria-labelledby={labelId}
      aria-hidden={!ready}
      inert={!ready}
      data-ready={ready}
      className="onboarding-mode-choices mx-auto mt-2 grid w-full max-w-md min-w-0 grid-cols-2 gap-x-3 gap-y-4 text-center sm:mt-3"
    >
      <p
        id={labelId}
        className="onboarding-mode-label text-muted-foreground col-span-2 text-sm font-normal"
      >
        {m.mode_answer_by({}, { locale })}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className="onboarding-mode-button bg-card h-full min-w-0 flex-col gap-3 rounded-2xl px-4 py-5 font-medium whitespace-normal"
        onClick={onVoice}
      >
        <img
          src="/images/onboarding/speak.png"
          alt=""
          width={240}
          height={160}
          className="pointer-events-none h-28 w-full max-w-44 shrink-0 object-contain sm:h-32"
        />
        {restart
          ? m.voice_restart({}, { locale })
          : m.voice_answer({}, { locale })}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className="onboarding-mode-button bg-card h-full min-w-0 flex-col gap-3 rounded-2xl px-4 py-5 font-medium whitespace-normal"
        onClick={onText}
      >
        <img
          src="/images/onboarding/chat.png"
          alt=""
          width={240}
          height={160}
          className="pointer-events-none h-28 w-full max-w-44 shrink-0 object-contain sm:h-32"
        />
        {m.mode_answer_text({}, { locale })}
      </Button>
      {restart && (
        <p className="text-muted-foreground col-span-2 text-xs leading-relaxed">
          {m.mode_switch_hint({}, { locale })}
        </p>
      )}
    </fieldset>
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
      <output className="sr-only">{goal.result?.reply}</output>
      {goal.error && (
        <p role="alert" className="text-destructive text-center text-sm">
          {m.onboarding_reply_error({}, { locale })}
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
  return (
    <Conversation className="h-full">
      <ConversationContent
        id={id}
        aria-live="off"
        aria-label={m.voice_show_transcript({}, { locale })}
        contentClassName="gap-4 p-2"
      >
        <OnboardingTranscriptMessages messages={messages} />
      </ConversationContent>
      <ConversationScrollButton
        aria-label={m.chat_jump_latest({}, { locale })}
      />
    </Conversation>
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
  onText,
}: {
  name: string;
  language: PracticeLanguage;
  onMessages: (messages: OnboardingMessage[]) => void;
  onResolved: (turn: OnboardingTurn & { status: "ready" | "choose" }) => void;
  onReady: (turn: OnboardingTurn) => void;
  onRestart: () => void;
  onText: () => void;
}) {
  const locale = useOnboardingLocale();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcriptId = useId();
  const recoveryHintId = useId();
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
          <p
            role={live.canRetry ? "alert" : "status"}
            className={
              live.canRetry ? "text-destructive" : "text-muted-foreground"
            }
          >
            {live.canRetry
              ? live.error
              : m.voice_unavailable_text({}, { locale })}
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
          <div className="mt-3 flex flex-col items-center gap-3">
            <p
              id={recoveryHintId}
              className="text-muted-foreground text-xs leading-relaxed"
            >
              {m.mode_switch_hint({}, { locale })}
            </p>
            <Button onClick={onText} aria-describedby={recoveryHintId}>
              {m.voice_continue_text({}, { locale })}
            </Button>
            {live.canRetry && (
              <Button
                variant="secondary"
                onClick={onRestart}
                aria-describedby={recoveryHintId}
              >
                {m.voice_restart({}, { locale })}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="pointer-events-none fixed inset-x-5 bottom-0 z-20 mx-auto h-40 max-w-xl overflow-hidden sm:inset-x-8">
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
  waitingForReply = false,
}: {
  messages?: OnboardingMessage[];
  busy?: boolean;
  waitingForReply?: boolean;
  name: string;
  introduction: string;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void | Promise<void>;
}) {
  const locale = useOnboardingLocale();
  const input = useRef<HTMLTextAreaElement>(null);
  const firstFocus = useRef(true);
  useEffect(() => {
    if (busy) {
      return;
    }
    const { activeElement } = document;
    if (
      firstFocus.current ||
      activeElement === document.body ||
      input.current?.parentElement?.contains(activeElement)
    ) {
      input.current?.focus({ preventScroll: true });
    }
    firstFocus.current = false;
  }, [busy]);
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
      <h1 className="sr-only">{m.heading_motivation({}, { locale })}</h1>
      <Conversation>
        <ConversationContent
          aria-live="off"
          aria-label={m.voice_show_transcript({}, { locale })}
          contentClassName="gap-4 pb-6"
        >
          <OnboardingTranscriptMessages
            name={name}
            introduction={introduction}
            messages={messages}
          />
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-muted-foreground flex items-center gap-3 text-sm empty:hidden"
          >
            {waitingForReply && (
              <>
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center"
                >
                  <ChitAvatar size={32} />
                </span>
                <span>{m.chat_typing({}, { locale })}</span>
              </>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton
          aria-label={m.chat_jump_latest({}, { locale })}
        />
      </Conversation>
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
