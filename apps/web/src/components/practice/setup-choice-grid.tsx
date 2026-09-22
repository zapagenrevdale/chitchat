import type {
  PracticeDraft,
  PracticeOptions,
  PracticeStep,
} from "@chitchat/contracts";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  Coffee,
  Compass,
  MessageCircle,
  Mountain,
  Plane,
  Sprout,
  Users,
  Utensils,
  Volume2,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { choicesForStep, stepFields, stepLabels } from "./setup-choices";
import type { usePersonaPreview } from "./use-persona-preview";

const choiceIcons: Record<string, LucideIcon> = {
  cafe: Coffee,
  restaurant: Utensils,
  airport: Plane,
  coworking: BriefcaseBusiness,
  rooftop: Mountain,
  hotel: Building2,
  easy: Sprout,
  balanced: Waves,
  stretch: Mountain,
  casual: MessageCircle,
  networking: BriefcaseBusiness,
  "mutual-friend": Users,
  ordering: Coffee,
  travel: Compass,
  "check-in": Building2,
};

export function SetupChoiceGrid({
  options,
  selection,
  screen,
  busy,
  preview,
  onChoose,
}: {
  options: PracticeOptions;
  selection: PracticeDraft;
  screen: PracticeStep;
  busy: boolean;
  preview: ReturnType<typeof usePersonaPreview>;
  onChoose: (id: string) => void;
}) {
  const [showAllPartners, setShowAllPartners] = useState(false);
  const availableChoices = choicesForStep(options, screen, selection);
  const visibleChoices =
    screen === "persona" && !showAllPartners
      ? availableChoices.slice(0, 6)
      : availableChoices;
  return (
    <>
      <div
        className="setup-choice-grid"
        aria-label={`Choose ${stepLabels[screen].toLowerCase()}`}
      >
        {visibleChoices.map((option) => {
          const Icon = choiceIcons[option.id] ?? Users;
          const selected = selection[stepFields[screen]] === option.id;
          const partner =
            screen === "persona"
              ? options.personas.find(({ id }) => id === option.id)
              : undefined;
          return (
            <div className="setup-choice-wrap" key={option.id}>
              <button
                type="button"
                className="setup-choice"
                data-choice={option.id}
                aria-pressed={selected}
                disabled={busy}
                onClick={() => onChoose(option.id)}
              >
                {partner ? (
                  <img
                    className="setup-choice-avatar"
                    src={partner.avatar}
                    alt=""
                    width={56}
                    height={56}
                  />
                ) : (
                  <span className="setup-choice-icon" aria-hidden="true">
                    <Icon />
                  </span>
                )}
                <span className="setup-choice-copy">
                  <strong>{option.name}</strong>{" "}
                  <span>{option.description}</span>
                </span>
                <span className="setup-choice-arrow" aria-hidden="true">
                  {selected ? <Check /> : <ArrowRight />}
                </span>
              </button>
              {partner && (
                <Button
                  type="button"
                  variant="ghost"
                  className="setup-listen-button"
                  disabled={busy}
                  onClick={() => {
                    void preview.play(partner);
                  }}
                  aria-label={`Hear ${partner.name}'s introduction`}
                >
                  <Volume2 aria-hidden="true" />
                  Hear introduction
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {screen === "persona" && (
        <Button
          type="button"
          variant="ghost"
          className="setup-show-partners"
          onClick={() => setShowAllPartners(!showAllPartners)}
        >
          {showAllPartners
            ? "Show fewer partners"
            : `Explore all ${options.personas.length} partners`}
        </Button>
      )}
    </>
  );
}
