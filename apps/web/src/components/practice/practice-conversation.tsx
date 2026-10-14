import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ConversationMessage } from "@/components/chat/conversation-message";
import { Button } from "@/components/ui/button";
import { WatercolorWave } from "@/components/ui/watercolor-wave";
import type { PracticeMessage } from "@/lib/practice-session";

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

function microphoneIsActive(practice: Practice) {
  return (
    (practice.state === "listening" || practice.state === "talking") &&
    !practice.muted &&
    (practice.selection?.mode !== "guided" ||
      practice.guided.phase === "listening")
  );
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

function PracticeTranscriptRail({
  messages,
  transcriptId,
  name,
}: {
  messages: PracticeMessage[];
  transcriptId: string;
  name: string;
}) {
  const { scrollRef, stopScroll } = useStickToBottomContext();
  return (
    <ConversationRail
      messages={messages}
      transcriptId={transcriptId}
      partnerName={name}
      targetRef={scrollRef}
      onNavigate={stopScroll}
    />
  );
}

function PracticeTranscript({
  messages,
  transcriptId,
  name,
  avatar,
  showRecap,
}: {
  messages: PracticeMessage[];
  transcriptId: string;
  name: string;
  avatar?: string;
  showRecap: boolean;
}) {
  return (
    <Conversation className="flex min-w-0 gap-2">
      <PracticeTranscriptRail
        messages={messages}
        transcriptId={transcriptId}
        name={name}
      />
      <div
        className={`relative min-w-0 flex-1 ${showRecap ? "h-72" : "h-[max(10rem,calc(100dvh-34rem))]"}`}
      >
        <ConversationContent
          aria-label="Conversation messages"
          className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          contentClassName="gap-3 px-1 py-4"
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
        </ConversationContent>
        <ConversationScrollButton />
      </div>
    </Conversation>
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
  const transcriptId = useId();
  const section = useRef<HTMLElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const connected = state === "listening" || state === "talking";
  const reviewing = state === "reviewing";
  const ongoing = state !== "ended" && !reviewing;
  const showRecap =
    (state === "ended" || reviewing) && practice.selection !== null;
  const status = conversationStatus(practice);

  useEffect(() => {
    section.current?.scrollIntoView?.({ block: "start" });
    endButton.current?.focus({ preventScroll: true });
  }, []);

  const conversationLog = (
    <PracticeTranscript
      messages={messages}
      transcriptId={transcriptId}
      name={name}
      avatar={avatar}
      showRecap={showRecap}
    />
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
      {ongoing && <SpeakingPrompt practice={practice} />}
      <div
        className={`relative isolate flex w-full flex-col items-center gap-4 ${ongoing ? "h-56 shrink-0 justify-end overflow-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))]" : "pb-[env(safe-area-inset-bottom)]"}`}
      >
        {ongoing && (
          <WatercolorWave
            active={microphoneIsActive(practice)}
            getLevel={practice.getInputVolume}
          />
        )}
        {!reviewing && (
          <output
            className={`relative z-10 px-4 text-center text-sm ${ongoing ? "text-primary font-medium" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {status}
          </output>
        )}
        {ongoing && (
          <div className="relative z-10 flex items-center justify-center">
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
