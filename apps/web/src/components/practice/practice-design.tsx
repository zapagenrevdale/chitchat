import type { PracticeLanguage, PracticeOptions } from "@chitchat/contracts";
import { presetPlaces as places } from "@chitchat/contracts";
import type { OnboardingProfile } from "@chitchat/contracts/onboarding";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { practiceOptionsQuery } from "@/lib/practice-api";

import { PracticeChecklistItem } from "./practice-checklist";
import { PracticeChoicePicker } from "./practice-choice-picker";
import { PracticeLanguagePicker } from "./practice-language";
import { PracticePersonaPicker } from "./practice-persona-picker";
import { PracticeReady } from "./practice-ready";
import { choicesForStep } from "./setup-choices";
import { useCustomChoice } from "./use-custom-choice";
import { usePractice } from "./use-practice";

const spring = { type: "spring", bounce: 0, duration: 0.4 } as const;
type DesignStep = "place" | "situation" | "persona" | "complete";

function profileLanguage(profile?: OnboardingProfile): PracticeLanguage {
  return profile?.language ?? "English";
}

function profileLearner(profile?: OnboardingProfile) {
  return profile ? { name: profile.name, skills: profile.skills } : undefined;
}

function EditGoals({
  onEdit,
  disabled,
}: {
  onEdit?: () => void;
  disabled: boolean;
}) {
  return onEdit ? (
    <Button variant="ghost" size="sm" disabled={disabled} onClick={onEdit}>
      Your goals
    </Button>
  ) : null;
}

export function PracticeDesign({
  profile,
  onEditProfile,
  onLanguageChange,
}: {
  profile?: OnboardingProfile;
  onEditProfile?: () => void;
  onLanguageChange?: (language: PracticeLanguage) => void;
} = {}) {
  const [language, setLanguage] = useState<PracticeLanguage>(
    profileLanguage(profile)
  );
  const [step, setStep] = useState<DesignStep>("place");
  const [placeIndex, setPlaceIndex] = useState(0);
  const [situationId, setSituationId] = useState<string | null>(null);
  const [customPersonaGroups, setCustomPersonaGroups] = useState<
    PracticeOptions["personaGroups"]
  >([]);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [animateSelection, setAnimateSelection] = useState(true);
  const layoutId = useId();
  const selectButton = useRef<HTMLButtonElement>(null);
  const personaItem = useRef<HTMLButtonElement>(null);
  const previousStep = useRef(step);
  const reducedMotion = useReducedMotion();
  const options = useQuery(practiceOptionsQuery);
  const practice = usePractice();
  const customConversation = useCustomChoice(
    () => {
      setPlaceIndex(places.length);
      setSituationId(null);
      setAnimateSelection(true);
      setStep("situation");
    },
    () => {
      setSituationId("custom");
      setAnimateSelection(true);
      setStep("persona");
    }
  );
  const placeChoices = customConversation.placeSummary
    ? [...places, { ...customConversation.placeSummary, id: "custom" }]
    : places;
  const selectedPlace = placeChoices[placeIndex];
  const presetSituations = options.data
    ? choicesForStep(options.data, "setting", { placeId: selectedPlace.id })
    : [];
  const situationChoices = customConversation.situationSummary
    ? [
        ...presetSituations,
        { ...customConversation.situationSummary, id: "custom" },
      ]
    : presetSituations;
  const selectedSituation =
    situationChoices.find(({ id }) => id === situationId) ??
    situationChoices[0];
  const personas = options.data?.personas ?? [];
  const personaGroups = [
    ...(options.data?.personaGroups ?? []),
    ...customPersonaGroups,
  ];
  const selectedPersona =
    personas.find(({ id }) => id === personaId) ?? personas[0];
  const hasPersonas = personaGroups.some(({ personaIds }) =>
    personaIds.includes(selectedPersona?.id)
  );
  const kind = step === "place" ? "place" : "situation";
  const customChoice = {
    ...customConversation,
    start: () =>
      kind === "place"
        ? customConversation.start({ kind: "place" })
        : customConversation.start({ kind: "situation", place: selectedPlace }),
  };
  const choice = kind === "place" ? selectedPlace : selectedSituation;
  const shouldAnimate = !reducedMotion && animateSelection;
  const transition = shouldAnimate ? spring : { duration: 0 };

  useEffect(() => {
    if (customChoice.active) {
      previousStep.current = step;
      return;
    }
    if (
      previousStep.current === step ||
      (step === "situation" && !selectedSituation) ||
      (step === "persona" && !hasPersonas)
    ) {
      return;
    }
    const button =
      step === "complete" ? personaItem.current : selectButton.current;
    if (button) {
      button.focus({ preventScroll: true });
      previousStep.current = step;
    }
  }, [step, selectedSituation, hasPersonas, customChoice.active]);

  function choiceLayoutId(
    name: "place" | "situation" | "persona" | "persona-avatar"
  ) {
    return reducedMotion ? undefined : `${layoutId}-${name}`;
  }

  function browse(direction: -1 | 1) {
    setAnimateSelection(false);
    if (kind === "place") {
      setPlaceIndex(
        (current) =>
          (current + direction + placeChoices.length) % placeChoices.length
      );
      return;
    }
    const index = situationChoices.indexOf(selectedSituation);
    setSituationId(
      situationChoices[
        (index + direction + situationChoices.length) % situationChoices.length
      ].id
    );
  }

  function editPlace(animate: boolean) {
    setAnimateSelection(animate);
    setStep("place");
    setSituationId(null);
    setPersonaId(null);
    setCustomPersonaGroups([]);
    customConversation.resetSituation();
  }

  function renderChecklist() {
    if (step === "place" || practice.state !== "idle") {
      return null;
    }
    return (
      <div className="relative mx-auto w-full max-w-xs shrink-0">
        <motion.div
          aria-hidden="true"
          layout
          className="bg-muted absolute inset-0"
          style={{ borderRadius: 18 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition}
        />
        <ul aria-label="Practice checklist" className="relative p-2">
          <PracticeChecklistItem
            name={selectedPlace.name}
            layoutId={choiceLayoutId("place")}
            transition={transition}
            animate={shouldAnimate}
            disabled={customChoice.active}
            onEdit={editPlace}
          />
          {(step === "persona" || step === "complete") && selectedSituation && (
            <PracticeChecklistItem
              name={selectedSituation.name}
              layoutId={choiceLayoutId("situation")}
              transition={transition}
              animate={shouldAnimate}
              disabled={false}
              onEdit={(animate) => {
                setAnimateSelection(animate);
                setStep("situation");
                setPersonaId(null);
                setCustomPersonaGroups([]);
              }}
            />
          )}
          {step === "complete" && selectedPersona && (
            <PracticeChecklistItem
              name={selectedPersona.name}
              avatar={selectedPersona.avatar}
              layoutId={choiceLayoutId("persona")}
              avatarLayoutId={choiceLayoutId("persona-avatar")}
              transition={transition}
              animate={shouldAnimate}
              disabled={false}
              buttonRef={personaItem}
              onEdit={(animate) => {
                setAnimateSelection(animate);
                setStep("persona");
              }}
            />
          )}
        </ul>
      </div>
    );
  }

  function renderPicker() {
    if (step === "persona" && hasPersonas && selectedSituation) {
      return (
        <PracticePersonaPicker
          scene={{ place: selectedPlace, situation: selectedSituation }}
          groups={personaGroups}
          recommendedGroupIds={customPersonaGroups.map(({ id }) => id)}
          personas={personas}
          onCreateGroup={(group) => {
            setCustomPersonaGroups((current) => [...current, group]);
          }}
          selectedId={selectedPersona.id}
          layoutId={choiceLayoutId("persona")}
          avatarLayoutId={choiceLayoutId("persona-avatar")}
          transition={transition}
          selectRef={selectButton}
          onChoose={(id) => {
            setAnimateSelection(false);
            setPersonaId(id);
          }}
          onSelect={(event) => {
            setAnimateSelection(event.detail > 0);
            setStep("complete");
          }}
        />
      );
    }
    if (step !== "persona" && choice) {
      return (
        <PracticeChoicePicker
          kind={kind}
          choice={choice}
          choices={kind === "place" ? placeChoices : situationChoices}
          layoutId={choiceLayoutId(kind)}
          selectionTransition={transition}
          customChoice={customChoice}
          onBrowse={browse}
          selectRef={selectButton}
          onSelect={(event) => {
            setAnimateSelection(event.detail > 0);
            setStep(kind === "place" ? "situation" : "persona");
          }}
        />
      );
    }
    const choicesLabel = step === "persona" ? "personas" : "situations";
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <output className="text-muted-foreground text-base">
          {options.isPending
            ? `Loading ${choicesLabel}…`
            : `Couldn't load ${choicesLabel}. Please try again.`}
        </output>
        {!options.isPending && (
          <Button
            variant="secondary"
            onClick={() => {
              void options.refetch();
            }}
          >
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <main
      id="main"
      className="relative flex min-h-dvh flex-col items-center gap-10 px-4 py-8 sm:gap-12 sm:py-12"
    >
      {practice.state === "idle" && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <PracticeLanguagePicker
            value={language}
            onChange={(value) => {
              setLanguage(value);
              onLanguageChange?.(value);
            }}
            disabled={customChoice.active}
          />
          <EditGoals onEdit={onEditProfile} disabled={customChoice.active} />
        </div>
      )}
      {renderChecklist()}
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        {step === "complete" && selectedSituation && selectedPersona && (
          <PracticeReady
            learner={profileLearner(profile)}
            language={language}
            practice={practice}
            selectedPlace={selectedPlace}
            selectedSituation={selectedSituation}
            selectedPersona={selectedPersona}
          />
        )}
        {step !== "complete" && (
          <div className="relative flex w-full max-w-sm flex-col items-center">
            {renderPicker()}
          </div>
        )}
      </div>
    </main>
  );
}
