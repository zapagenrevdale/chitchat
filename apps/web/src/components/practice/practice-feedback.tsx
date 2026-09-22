import type { PracticeFeedback as Feedback } from "@chitchat/contracts";
import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

const skills = [
  { key: "curiosity", name: "Curiosity", description: "Show interest" },
  {
    key: "listening",
    name: "Listening",
    description: "Build on what they say",
  },
  { key: "sharing", name: "Sharing", description: "Give a little of yourself" },
] as const;

function skillLabel(score: number) {
  if (score >= 4) {
    return "Strong";
  }
  return score >= 3 ? "Going well" : "Keep practicing";
}

function scoreLabel(score: number) {
  if (score >= 9) {
    return "A great back-and-forth";
  }
  if (score >= 7) {
    return "You're finding your flow";
  }
  return score >= 4 ? "Something to build on" : "One small step at a time";
}

export function PracticeFeedback({
  name,
  data,
  pending,
  error,
}: {
  name: string;
  data: Feedback | null;
  pending: boolean;
  error: string | null;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  function renderFeedback() {
    if (data?.status === "insufficient") {
      return (
        <div className="py-6 text-center">
          <h3 className="text-xl font-medium tracking-tight">
            A little more to go on
          </h3>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xs text-base leading-relaxed">
            No score yet. Try a few back-and-forth turns so {name} has enough of
            your conversation to give useful feedback.
          </p>
        </div>
      );
    }
    if (pending && !data && !error) {
      return (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3">
          <LoaderCircle
            aria-hidden="true"
            className="text-muted-foreground size-5 motion-safe:animate-spin"
          />
          <output className="text-muted-foreground text-base">
            {name} is reflecting on your conversation…
          </output>
        </div>
      );
    }
    if (!data) {
      return (
        <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
          <h3 className="text-xl font-medium tracking-tight">
            No feedback this time
          </h3>
          <p
            role="alert"
            className="text-muted-foreground max-w-xs text-base leading-relaxed"
          >
            {error ??
              `The live conversation ended before ${name} could review it. Try another practice when you're ready.`}
          </p>
        </div>
      );
    }
    if (data?.status !== "scored") {
      return null;
    }
    return (
      <>
        <div className="pb-7 text-center">
          <p
            className="mt-4 flex items-baseline justify-center gap-1.5"
            aria-label={`Conversation score: ${data.score} out of 10`}
          >
            <span className="text-6xl font-medium tracking-[-0.06em] tabular-nums">
              {data.score}
            </span>
            <span className="text-muted-foreground text-lg">/ 10</span>
          </p>
          <h3 className="mt-3 text-xl font-medium tracking-tight text-balance">
            {scoreLabel(data.score)}
          </h3>
          <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-base leading-relaxed text-pretty">
            {data.summary}
          </p>
        </div>
        <dl className="divide-border divide-y border-y">
          {skills.map(({ key, name: skillName, description }) => (
            <div
              key={key}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-4"
            >
              <dt className="text-base font-medium">
                {skillName}
                <span className="sr-only">: {description}</span>
              </dt>
              <dd
                className={`rounded-full px-2.5 py-1 text-sm ${data[key].score >= 4 ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {skillLabel(data[key].score)}
              </dd>
              <dd className="text-muted-foreground col-span-2 mt-1.5 text-base leading-relaxed">
                {data[key].note}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 space-y-5">
          {data.highlight && (
            <div>
              <h3 className="flex items-center gap-2 text-base font-medium">
                <Check
                  aria-hidden="true"
                  className="text-success-foreground size-4"
                />
                Keep this
              </h3>
              <blockquote className="mt-2 text-base leading-relaxed wrap-anywhere">
                “{data.highlight.quote}”
              </blockquote>
              <p className="text-muted-foreground mt-1 text-base leading-relaxed">
                {data.highlight.note}
              </p>
            </div>
          )}
          <div className="bg-accent rounded-2xl p-4">
            <h3 className="flex items-center gap-2 text-base font-medium">
              <ArrowUpRight aria-hidden="true" className="size-4" />
              Try next time
            </h3>
            <p className="text-muted-foreground mt-2 text-base leading-relaxed">
              {data.nextStep.tip}
            </p>
          </div>
        </div>
        <details className="text-muted-foreground mt-5 text-sm leading-relaxed">
          <summary className="focus-visible:outline-ring mx-auto w-fit cursor-pointer rounded-sm p-2 underline-offset-4 hover:underline">
            How this score works
          </summary>
          <p className="mt-2">
            Curiosity, listening, and sharing count equally. {name} rates each
            from 0–5, then turns their average into a score out of 10. 7–8 means
            a good exchange; 9–10 means strong habits throughout.
          </p>
          <p className="mt-2">
            Feedback uses your conversation transcript and the same rubric for
            every partner. Voice, timing, accent, and confidence aren’t scored.
            Automatic captions and AI can miss things; this is practice
            feedback, not a judgment of you.
          </p>
        </details>
      </>
    );
  }

  return (
    <section
      aria-label="Conversation feedback"
      className="mx-auto w-full max-w-md wrap-anywhere"
    >
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-muted-foreground font-handwriting text-center text-base outline-none"
      >
        Feedback from {name}
      </h2>
      <div aria-live="polite" aria-busy={pending && !data && !error}>
        {renderFeedback()}
        {data && error && (
          <output className="text-muted-foreground mt-4 text-center text-sm">
            {error}
          </output>
        )}
      </div>
    </section>
  );
}
