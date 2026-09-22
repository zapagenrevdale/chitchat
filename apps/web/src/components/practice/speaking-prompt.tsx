import { RefreshCw, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { phraseWordStates } from "@/lib/phrase-progress";
import type { GuidedProgress } from "@/lib/practice-guided";

import type { usePractice } from "./use-practice";

type Practice = ReturnType<typeof usePractice>;
const wordClasses: Record<string, string> = {
  confirmed: "text-foreground",
  provisional: "text-primary underline decoration-dashed underline-offset-4",
  upcoming: "text-muted-foreground",
};

function progressLabel(progress: GuidedProgress) {
  if (progress.phase === "complete") {
    return "Phrase complete";
  }
  if (progress.phase !== "listening") {
    return "";
  }
  if (progress.confirmed > 0) {
    return "Keep going from the highlighted progress.";
  }
  return "Speak naturally. Words light up as you go.";
}

function GuidedPrompt({ practice }: { practice: Practice }) {
  const progress = practice.guided;
  const ready = progress.phase === "listening" || progress.phase === "error";
  return (
    <>
      {progress.text ? (
        <>
          <p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
            Say this
          </p>
          <p
            className="text-xl leading-relaxed text-pretty sm:text-2xl"
            aria-label={progress.text}
          >
            {phraseWordStates(
              progress.text,
              progress.confirmed,
              progress.preview
            ).map(({ word, state }, index) => (
              <span
                key={`${index}-${word}`}
                aria-hidden="true"
                className={wordClasses[state]}
              >
                {word}{" "}
              </span>
            ))}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-base">
          {progress.phase === "error"
            ? "Let's try that again."
            : "Preparing your next turn…"}
        </p>
      )}
      <output className="text-muted-foreground text-sm" aria-live="polite">
        {progressLabel(progress)}
      </output>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!ready}
          onClick={() => practice.retryGuided()}
        >
          Try again
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!ready}
          onClick={() => practice.skipGuided()}
        >
          Skip turn
        </Button>
      </div>
    </>
  );
}

function SuggestedReply({ practice }: { practice: Practice }) {
  return (
    <>
      {practice.suggestion && (
        <>
          <p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
            Try saying…
          </p>
          <p className="text-xl leading-relaxed text-pretty sm:text-2xl">
            {practice.suggestion}
          </p>
        </>
      )}
      <div className="flex items-center gap-1">
        {practice.suggestion ? (
          <>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Suggest another reply"
              disabled={
                practice.suggestionPending || practice.state !== "listening"
              }
              onClick={() => {
                void practice.suggestReply();
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Dismiss suggested reply"
              onClick={() => practice.dismissSuggestion()}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={
              practice.suggestionPending ||
              practice.state !== "listening" ||
              practice.messages.at(-1)?.speaker !== "partner"
            }
            onClick={() => {
              void practice.suggestReply();
            }}
          >
            <Sparkles className="size-4" />
            {practice.suggestionPending ? "Thinking…" : "Suggest a reply"}
          </Button>
        )}
      </div>
      {practice.suggestionPending && practice.suggestion && (
        <output className="text-muted-foreground text-sm">Thinking…</output>
      )}
      {practice.suggestionError && (
        <p role="alert" className="text-muted-foreground text-sm">
          {practice.suggestionError}
        </p>
      )}
    </>
  );
}

export function SpeakingPrompt({ practice }: { practice: Practice }) {
  return (
    <div className="mx-auto flex min-h-36 w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      {practice.selection?.mode === "guided" ? (
        <GuidedPrompt practice={practice} />
      ) : (
        <SuggestedReply practice={practice} />
      )}
    </div>
  );
}
