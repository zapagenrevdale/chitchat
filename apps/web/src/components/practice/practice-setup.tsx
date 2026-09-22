import type {
  PracticeDraft,
  PracticeOptions,
  PracticeSelection,
  PracticeStep,
  PracticeSetupRequest,
} from "@chitchat/contracts";
import { ArrowLeft, Check, Pencil, Shuffle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { resolvePracticeSetup } from "@/lib/practice-api";

import { PracticeLanguagePicker } from "./practice-language";
import { SetupAnswer } from "./setup-answer";
import { SetupChoiceGrid } from "./setup-choice-grid";
import {
  chooseSetupOption,
  nextSetupScreen,
  selectionLabel,
  setupSteps,
  stepFields,
  stepLabels,
} from "./setup-choices";
import type { SetupScreen } from "./setup-choices";
import { SetupMission } from "./setup-mission";
import { usePersonaPreview } from "./use-persona-preview";

import "./practice-setup.css";

const headings = {
  place: [
    "Where do you want to practice?",
    "Pick a place, describe your own, or see where chance takes you.",
  ],
  setting: [
    "What brings you here?",
    "Give your conversation a little purpose.",
  ],
  difficulty: [
    "How much of a challenge?",
    "Choose what feels right today. There's no wrong starting point.",
  ],
  persona: [
    "Who will you meet?",
    "Find a voice you feel comfortable with. You can listen before choosing.",
  ],
  review: [
    "Your mission is ready.",
    "A place, a person, and a little reason to say hello.",
  ],
};
interface SetupProps {
  options: PracticeOptions;
  selection: PracticeDraft;
  onChange: (selection: PracticeDraft) => void;
  onStart: (selection: PracticeSelection) => void;
}

export function PracticeSetup({
  options,
  selection,
  onChange,
  onStart,
}: SetupProps) {
  const [screen, setScreen] = useState<SetupScreen>(() =>
    nextSetupScreen(selection)
  );
  const [busy, setBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousScreen = useRef(screen);
  const preview = usePersonaPreview();
  const currentIndex = screen === "review" ? 4 : setupSteps.indexOf(screen);
  const complete = setupSteps.filter(
    (step) => selection[stepFields[step]]
  ).length;

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    []
  );
  useEffect(() => {
    if (previousScreen.current !== screen) {
      heading.current?.focus();
      previousScreen.current = screen;
    }
  }, [screen]);

  function navigate(next: SetupScreen) {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setSetupError(null);
    preview.stop();
    setScreen(next);
  }
  function apply(next: PracticeDraft) {
    onChange(next);
    navigate(nextSetupScreen(next));
  }
  async function resolve(
    action: PracticeSetupRequest["action"],
    text?: string
  ) {
    request.current?.abort();
    preview.stop();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setSetupError(null);
    try {
      const result = await resolvePracticeSetup(
        {
          selection,
          step: screen === "review" ? "place" : screen,
          action,
          text,
        },
        AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
      );
      if (request.current === controller) {
        apply(result.selection);
      }
    } catch (error) {
      if (request.current === controller && !controller.signal.aborted) {
        setSetupError(
          error instanceof Error
            ? error.message
            : "Couldn't update your choices. Try again."
        );
      }
    }
    if (request.current === controller) {
      request.current = null;
      setBusy(false);
    }
  }

  return (
    <section
      className="practice-setup"
      aria-labelledby="setup-heading"
      aria-busy={busy}
    >
      <div className="setup-progress-row">
        <span>
          {screen === "review"
            ? "READY WHEN YOU ARE"
            : `YOUR SCENE · ${currentIndex + 1} OF 4`}
        </span>
        <PracticeLanguagePicker
          value={selection.language ?? "English"}
          disabled={busy}
          onChange={(language) => onChange({ ...selection, language })}
        />
      </div>
      <progress
        className="setup-progress"
        value={complete}
        max={4}
        aria-label={`${complete} of 4 choices made`}
      />
      {complete > 0 && (
        <nav className="setup-answers" aria-label="Edit your choices">
          {setupSteps.map((step) => {
            const label = selectionLabel(options, step, selection);
            return label ? (
              <button
                key={step}
                type="button"
                onClick={() => navigate(step)}
                aria-label={`Edit ${stepLabels[step].toLowerCase()}: ${label}`}
                aria-current={screen === step ? "step" : undefined}
              >
                <Check aria-hidden="true" />
                <span>{label}</span>
                <Pencil aria-hidden="true" />
              </button>
            ) : null;
          })}
        </nav>
      )}
      <header className="setup-heading">
        <div className="setup-eyebrow">
          <Sparkles aria-hidden="true" /> A LITTLE PRACTICE, A LITTLE
          POSSIBILITY
        </div>
        <h2 id="setup-heading" ref={heading} tabIndex={-1}>
          {headings[screen][0]}
        </h2>
        <p>{headings[screen][1]}</p>
      </header>
      {screen === "review" ? (
        <SetupMission
          options={options}
          selection={selection}
          busy={busy}
          preview={preview}
          onStart={onStart}
          onShuffle={() => {
            void resolve("random-all");
          }}
        />
      ) : (
        <>
          <SetupChoiceGrid
            key={`choices-${screen}`}
            options={options}
            selection={selection}
            screen={screen}
            busy={busy}
            preview={preview}
            onChoose={(id) =>
              apply(chooseSetupOption(options, selection, screen, id))
            }
          />
          <Button
            type="button"
            variant="outline"
            className="setup-surprise"
            disabled={busy}
            onClick={() => {
              void resolve("random");
            }}
          >
            <Shuffle aria-hidden="true" />
            Surprise me <span>Pick my {stepLabels[screen].toLowerCase()}</span>
          </Button>
          <SetupAnswer
            key={`answer-${screen}`}
            busy={busy}
            previewing={Boolean(preview.status)}
            onVoiceStart={() => preview.stop()}
            onAnswer={(text) => {
              void resolve("answer", text);
            }}
          />
        </>
      )}
      {preview.status && (
        <div className="setup-preview-status">
          <output>
            <Badge variant="secondary">
              {preview.status === "loading"
                ? "Loading introduction…"
                : "Introduction playing…"}
            </Badge>
          </output>
          <Button type="button" variant="ghost" onClick={() => preview.stop()}>
            Stop introduction
          </Button>
        </div>
      )}
      {preview.error && (
        <p className="setup-error" role="alert">
          {preview.error}
        </p>
      )}
      {setupError && (
        <p className="setup-error" role="alert">
          {setupError}
        </p>
      )}
      {busy && (
        <output className="setup-hint">Putting your scene together…</output>
      )}
      <div className="setup-bottom-nav">
        {currentIndex > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              navigate(setupSteps[currentIndex - 1] as PracticeStep)
            }
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Button>
        ) : (
          <span />
        )}
        {screen === "place" && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void resolve("random-all");
            }}
          >
            <Sparkles aria-hidden="true" />
            Surprise me with everything
          </Button>
        )}
        {screen !== "place" && (
          <span className="setup-hint">Your choices are always editable.</span>
        )}
      </div>
    </section>
  );
}
