import type {
  PersonaRecommendationRequest,
  PracticeOptions,
} from "@chitchat/contracts";
import { LoaderCircle, Shuffle, Volume2, WandSparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { RadioGroup } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent, Ref } from "react";

import { Button } from "@/components/ui/button";
import { recommendPersonas } from "@/lib/practice-api";

import { PersonaAvatar } from "./persona-avatar";
import { PracticeChoiceNavigation } from "./practice-choice-navigation";
import { SelectChoiceButton } from "./select-choice-button";
import { usePersonaPreview } from "./use-persona-preview";

export function PracticePersonaPicker({
  scene,
  groups,
  recommendedGroupIds,
  personas,
  selectedId,
  layoutId,
  avatarLayoutId,
  transition,
  onChoose,
  onCreateGroup,
  onSelect,
  selectRef,
}: {
  scene: PersonaRecommendationRequest;
  groups: PracticeOptions["personaGroups"];
  recommendedGroupIds: string[];
  personas: PracticeOptions["personas"];
  selectedId: string;
  layoutId?: string;
  avatarLayoutId?: string;
  transition: Transition;
  onChoose: (id: string) => void;
  onCreateGroup: (group: PracticeOptions["personaGroups"][number]) => void;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  selectRef: Ref<HTMLButtonElement>;
}) {
  const [groupId, setGroupId] = useState(
    () => groups.find(({ personaIds }) => personaIds.includes(selectedId))?.id
  );
  const [recommending, setRecommending] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(
    null
  );
  const recommendationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => recommendationRequest.current?.abort(), []);
  const reducedMotion = useReducedMotion();
  const preview = usePersonaPreview();
  const availableGroups = groups
    .map((group) => ({
      ...group,
      personas: group.personaIds.flatMap((id) =>
        personas.filter((persona) => persona.id === id)
      ),
    }))
    .filter((group) => group.personas.length > 0);
  const group =
    availableGroups.find(({ id }) => id === groupId) ?? availableGroups[0];

  function browse(direction: -1 | 1) {
    preview.stop();
    const index = availableGroups.indexOf(group);
    const next =
      availableGroups[
        (index + direction + availableGroups.length) % availableGroups.length
      ];
    setGroupId(next.id);
    onChoose(next.personas[0].id);
  }

  async function createGroup() {
    if (recommendationRequest.current) {
      return;
    }
    preview.stop();
    const controller = new AbortController();
    recommendationRequest.current = controller;
    setRecommending(true);
    setRecommendationError(null);
    try {
      const recommendation = await recommendPersonas(scene, controller.signal);
      controller.signal.throwIfAborted();
      const newGroup = { ...recommendation, id: crypto.randomUUID() };
      onCreateGroup(newGroup);
      setGroupId(newGroup.id);
      onChoose(newGroup.personaIds[0]);
    } catch (error) {
      if (!controller.signal.aborted) {
        setRecommendationError(
          error instanceof Error
            ? error.message
            : "Chit couldn't recommend personas. Please try again."
        );
      }
    }
    if (!controller.signal.aborted) {
      recommendationRequest.current = null;
      setRecommending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center">
      <PracticeChoiceNavigation
        kind="persona group"
        name={group.name}
        choices={availableGroups}
        transition={{ duration: 0 }}
        onBrowse={browse}
      />
      {recommendedGroupIds.includes(group.id) && (
        <p className="text-muted-foreground font-handwriting mt-2 text-center text-sm">
          *suggested personas for this scenario.
        </p>
      )}
      <RadioGroup.Root
        aria-label={`${group.name} personas`}
        value={selectedId}
        onValueChange={onChoose}
        className={`mt-6 grid w-full auto-rows-[6rem] gap-x-2 gap-y-3 ${group.personas.length <= 6 ? "grid-cols-3" : "grid-cols-4"}`}
      >
        {group.personas.map((persona) => {
          const selected = persona.id === selectedId;
          return (
            <RadioGroup.Item
              key={persona.id}
              value={persona.id}
              onFocus={() => {
                preview.stop();
                onChoose(persona.id);
              }}
              onClick={() => {
                void preview.play(persona);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void preview.play(persona);
                }
              }}
              className="focus-visible:ring-ring/50 flex touch-manipulation flex-col items-center justify-center gap-2 rounded-xl outline-none focus-visible:ring-2 motion-safe:active:scale-[0.97]"
            >
              <PersonaAvatar
                src={persona.avatar}
                selected={selected}
                layoutId={selected ? avatarLayoutId : undefined}
                transition={transition}
              />
              <motion.span
                layoutId={selected ? layoutId : undefined}
                transition={transition}
                className="relative text-base leading-snug font-medium tracking-[-0.02em]"
              >
                {persona.name}
              </motion.span>
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-12 touch-manipulation"
          aria-label="Choose a random persona"
          title="Choose a random persona"
          disabled={group.personas.length < 2}
          onClick={() => {
            preview.stop();
            const choices = group.personas.filter(
              ({ id }) => id !== selectedId
            );
            if (choices.length > 0) {
              onChoose(choices[Math.floor(Math.random() * choices.length)].id);
            }
          }}
        >
          <Shuffle aria-hidden="true" className="size-5" />
        </Button>
        <SelectChoiceButton asChild>
          <motion.button
            ref={selectRef}
            type="button"
            onClick={onSelect}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          >
            Select persona
          </motion.button>
        </SelectChoiceButton>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-12 touch-manipulation"
          aria-label="Ask Chit to recommend personas"
          title="Ask Chit to recommend personas for this place and situation"
          disabled={recommending}
          aria-busy={recommending}
          onClick={() => {
            void createGroup();
          }}
        >
          {recommending ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-5 motion-safe:animate-spin"
            />
          ) : (
            <WandSparkles aria-hidden="true" className="size-5" />
          )}
        </Button>
      </div>
      {recommending && (
        <output className="text-muted-foreground mt-3 text-sm">
          Chit is finding personas for your scene…
        </output>
      )}
      {recommendationError && (
        <p role="alert" className="text-destructive mt-3 text-center text-sm">
          {recommendationError}
        </p>
      )}
      <div className="text-muted-foreground mt-4 flex min-h-12 w-full max-w-xs items-center justify-center text-center text-sm">
        {preview.status && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => preview.stop()}
            aria-label="Stop persona preview"
          >
            <Volume2 aria-hidden="true" className="size-3.5" />
            <output>
              {preview.status === "loading" ? "Loading voice…" : "Stop preview"}
            </output>
          </Button>
        )}
        {preview.error && <p role="alert">{preview.error}</p>}
        {!preview.status && !preview.error && (
          <p>Press a persona to hear their voice.</p>
        )}
      </div>
    </div>
  );
}
