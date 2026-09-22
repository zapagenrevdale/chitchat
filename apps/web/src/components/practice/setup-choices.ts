import type {
  PracticeDraft,
  PracticeOptions,
  PracticeStep,
} from "@chitchat/contracts";

export const setupSteps = [
  "place",
  "setting",
  "difficulty",
  "persona",
] as const;
export type SetupScreen = PracticeStep | "review";
export const stepFields = {
  place: "placeId",
  setting: "settingId",
  difficulty: "difficulty",
  persona: "personaId",
} as const;
export const stepLabels = {
  place: "Place",
  setting: "Situation",
  difficulty: "Challenge",
  persona: "Partner",
};

export function nextSetupScreen(selection: PracticeDraft): SetupScreen {
  return setupSteps.find((step) => !selection[stepFields[step]]) ?? "review";
}

export function choicesForStep(
  options: PracticeOptions,
  step: PracticeStep,
  selection: PracticeDraft
) {
  switch (step) {
    case "place": {
      return options.places;
    }
    case "setting": {
      return options.settings.filter(
        ({ placeIds }) =>
          placeIds.length === 0 ||
          selection.placeId === "custom" ||
          placeIds.includes(selection.placeId ?? "")
      );
    }
    case "difficulty": {
      return options.levels;
    }
    default: {
      return options.personas;
    }
  }
}

export function selectionLabel(
  options: PracticeOptions,
  step: PracticeStep,
  selection: PracticeDraft
) {
  if (step === "place" && selection.placeId === "custom") {
    return selection.customPlace;
  }
  if (step === "setting" && selection.settingId === "custom") {
    return selection.customSetting;
  }
  const choices =
    step === "setting"
      ? options.settings
      : choicesForStep(options, step, selection);
  return choices.find(({ id }) => id === selection[stepFields[step]])?.name;
}

export function chooseSetupOption(
  options: PracticeOptions,
  selection: PracticeDraft,
  step: PracticeStep,
  id: string
): PracticeDraft {
  const next = { ...selection, [stepFields[step]]: id };
  if (step === "place") {
    delete next.customPlace;
    if (
      next.settingId !== "custom" &&
      !choicesForStep(options, "setting", next).some(
        (setting) => setting.id === next.settingId
      )
    ) {
      delete next.settingId;
      delete next.customSetting;
    }
  }
  if (step === "setting") {
    delete next.customSetting;
  }
  return next;
}
