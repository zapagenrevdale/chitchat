import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { LiveWaveform } from "@/components/ui/live-waveform";
import type { PracticeMessage } from "@/lib/practice-live";

import { ConversationRail } from "./conversation-rail";
import { PracticeFeedback } from "./practice-feedback";
import { SpeakingPrompt } from "./speaking-prompt";
import type { usePractice, PracticeState } from "./use-practice";

type Practice = ReturnType<typeof usePractice>;
const statusLabels: Record<PracticeState, string> = {
  idle: "Choose your conversation",
  starting: "Connecting…",
  listening: "Listening · speak naturally",
  reconnecting: "Reconnecting…",
  talking: "Your partner is speaking",
  reviewing: "Your microphone is off",
  ended: "Conversation ended",
};

export function ConversationMessage({
  message,
  transcriptId,
  name,
  avatar,
}: {
  message: PracticeMessage;
  transcriptId: string;
  name: string;
  avatar?: string;
}) {
  return (
    <div
      id={`${transcriptId}-${message.id}`}
      className={`flex max-w-[85%] items-end gap-2 ${message.speaker === "user" ? "self-end" : "self-start"}`}
    >
      {message.speaker === "partner" &&
        (avatar ? (
          <img
            src={avatar}
            alt=""
            width={32}
            height={32}
            className="bg-card size-8 shrink-0 rounded-full"
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-sm"
          >
            {name[0]}
          </span>
        ))}
      <p
        className={`rounded-3xl px-4 py-3 text-lg leading-relaxed wrap-anywhere whitespace-pre-wrap ${message.speaker === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}`}
      >
        <span className="sr-only">
          {message.speaker === "user" ? "You" : name}:{" "}
        </span>
        {message.text}
      </p>
    </div>
  );
}

function conversationStatus(practice: Practice) {
  const { state, muted } = practice;
  if (
    practice.selection?.mode === "guided" &&
    practice.guided.phase === "error" &&
    state !== "ended"
  ) {
    return "Microphone paused · try again";
  }
  return muted && state === "listening"
    ? "Microphone muted"
    : statusLabels[state];
}

function ConversationRecap({
  practice,
  name,
}: {
  practice: Practice;
  name: string;
}) {
  if (practice.selection?.mode === "guided") {
    return (
      <div className="text-center">
        <h2 className="text-lg font-medium">Guided practice complete</h2>
        <p className="text-muted-foreground mt-2 text-base">
          {practice.guided.completed}{" "}
          {practice.guided.completed === 1 ? "phrase" : "phrases"} completed ·{" "}
          {practice.guided.skipped} skipped
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          You practiced speaking prepared replies.
        </p>
      </div>
    );
  }
  return (
    <PracticeFeedback
      name={name}
      data={practice.feedback}
      pending={practice.state === "reviewing"}
      error={practice.feedbackError}
    />
  );
}

export function PracticeConversation({
  practice,
  name,
  avatar,
  scene,
}: {
  practice: Practice;
  name: string;
  avatar?: string;
  scene: string;
}) {
  const { state, messages, muted } = practice;
  const reducedMotion = useReducedMotion();
  const transcriptId = useId();
  const followLatest = useRef(true);
  const transcript = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const connected = state === "listening" || state === "talking";
  const reviewing = state === "reviewing";
  const showRecap =
    (state === "ended" || reviewing) && practice.selection !== null;
  const status = conversationStatus(practice);

  useEffect(() => {
    section.current?.scrollIntoView?.({ block: "start" });
    endButton.current?.focus({ preventScroll: true });
  }, []);

  // Follow the new layout before queued scroll events can mistake message growth
  // for the reader scrolling away from the bottom.
  useLayoutEffect(() => {
    const element = transcript.current;
    if (element && messages.length > 0 && followLatest.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const conversationLog = (
    <div className="flex min-w-0 gap-2">
      <ConversationRail
        messages={messages}
        transcriptId={transcriptId}
        targetRef={transcript}
        partnerName={name}
        onNavigate={() => {
          followLatest.current = false;
        }}
      />
      <div
        ref={transcript}
        onScroll={(event) => {
          const element = event.currentTarget;
          followLatest.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <=
            2;
        }}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        // The scrollable message log must be reachable for keyboard scrolling.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className={`relative flex min-w-0 flex-1 [scrollbar-width:none] flex-col gap-3 overflow-y-auto overscroll-contain px-1 py-4 [&::-webkit-scrollbar]:hidden ${showRecap ? "h-72" : "h-[max(10rem,calc(100dvh-34rem))]"}`}
      >
        {messages.map((message) => (
          <ConversationMessage
            key={message.id}
            message={message}
            transcriptId={transcriptId}
            name={name}
            avatar={avatar}
          />
        ))}
      </div>
    </div>
  );

  return (
    <section
      ref={section}
      aria-label={`Conversation with ${name}`}
      className="flex w-full min-w-0 flex-col gap-6"
    >
      <header className="text-center">
        <h1 className="text-base font-medium">{name}</h1>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">
          {scene}
        </p>
      </header>
      <output
        hidden={!practice.captionWarning}
        className="text-muted-foreground text-center text-sm"
      >
        {practice.captionWarning}
      </output>
      {reviewing && (
        <div className="flex flex-col items-center gap-2">
          <output className="text-muted-foreground text-center text-sm">
            Your microphone is off
          </output>
          <Button
            variant="secondary"
            className="rounded-full"
            onClick={() => practice.end()}
          >
            {practice.feedback ? "Stop voice recap" : "Skip feedback"}
          </Button>
        </div>
      )}
      {showRecap && <ConversationRecap practice={practice} name={name} />}
      {showRecap ? (
        <details className="mx-auto w-full max-w-md">
          <summary className="text-muted-foreground focus-visible:outline-ring cursor-pointer rounded-sm py-3 text-center text-base">
            View conversation
          </summary>
          {conversationLog}
        </details>
      ) : (
        conversationLog
      )}
      <div className="flex flex-col items-center gap-4 pb-[env(safe-area-inset-bottom)]">
        {!reviewing && (
          <output
            className="text-muted-foreground text-center text-sm"
            aria-live="polite"
          >
            {status}
          </output>
        )}
        {state !== "ended" && !reviewing && (
          <>
            <SpeakingPrompt practice={practice} />
            <LiveWaveform
              analyser={practice.getAnalyser()}
              active={connected && !muted && !reducedMotion}
              mode="static"
              height={48}
              barWidth={3}
              barGap={3}
              fadeEdges
              className="max-w-xs"
              aria-label={status}
            />
            <div className="relative flex items-center justify-center">
              {connected && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-16 rounded-full"
                  aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                  onClick={() => practice.toggleMute()}
                >
                  {muted ? (
                    <MicOff aria-hidden="true" />
                  ) : (
                    <Mic aria-hidden="true" />
                  )}
                </Button>
              )}
              <Button
                ref={endButton}
                variant="ghost"
                size="icon"
                className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive size-12 touch-manipulation rounded-full transition-colors"
                aria-label="End conversation"
                title="Finish practice and get feedback"
                onClick={() => practice.end()}
              >
                <PhoneOff aria-hidden="true" className="size-5" />
              </Button>
            </div>
          </>
        )}
        {state === "ended" && (
          <Button className="rounded-full" onClick={() => practice.reset()}>
            Practice again
          </Button>
        )}
      </div>
    </section>
  );
}
