import type { CustomChoiceSummary } from "@chitchat/contracts";
import { motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import type { MouseEvent, Ref } from "react";

import { CustomChoiceVoice } from "./custom-choice-voice";
import { PracticeChoiceNavigation } from "./practice-choice-navigation";
import { SelectChoiceButton } from "./select-choice-button";
import type { useCustomChoice } from "./use-custom-choice";

const spring = { type: "spring", bounce: 0, duration: 0.4 } as const;

export function PracticeChoicePicker({
  kind,
  choice,
  choices,
  layoutId,
  selectionTransition,
  customChoice,
  onBrowse,
  onSelect,
  selectRef,
}: {
  kind: "place" | "situation";
  choice: CustomChoiceSummary;
  choices: readonly (CustomChoiceSummary & { id: string })[];
  layoutId?: string;
  selectionTransition: Transition;
  customChoice: Omit<ReturnType<typeof useCustomChoice>, "start"> & {
    start: () => Promise<void>;
  };
  onBrowse: (direction: -1 | 1) => void;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  selectRef: Ref<HTMLButtonElement>;
}) {
  const reducedMotion = useReducedMotion();
  const { active } = customChoice;
  const transition = reducedMotion ? { duration: 0.15 } : spring;

  return (
    <>
      <motion.div
        initial={false}
        animate={{ y: active ? -200 : 0 }}
        transition={reducedMotion ? { duration: 0 } : spring}
        className="flex w-full flex-col items-center"
      >
        <PracticeChoiceNavigation
          kind={kind}
          name={choice.name}
          choices={choices}
          layoutId={layoutId}
          transition={selectionTransition}
          active={active}
          onBrowse={onBrowse}
        />
        <div className="text-muted-foreground mt-4 grid w-full max-w-xs text-center text-base leading-relaxed text-pretty wrap-anywhere">
          {/* Reserve the tallest summary so browsing never shifts the controls. */}
          {choices.map((option) => (
            <p
              key={option.id}
              aria-hidden="true"
              data-summary={option.description}
              className="invisible col-start-1 row-start-1 before:content-[attr(data-summary)]"
            />
          ))}
          <motion.p
            initial={false}
            animate={{ opacity: active ? 0 : 1 }}
            transition={{
              duration: active || reducedMotion ? 0.15 : spring.duration,
              ease: "easeOut",
            }}
            aria-hidden={active}
            aria-live="polite"
            aria-atomic="true"
            className="col-start-1 row-start-1"
          >
            {choice.description}
          </motion.p>
        </div>
        <SelectChoiceButton asChild className="mt-10">
          <motion.button
            ref={selectRef}
            type="button"
            disabled={active}
            aria-hidden={active}
            initial={false}
            animate={{ opacity: active ? 0 : 1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={transition}
            onClick={onSelect}
          >
            Select {kind}
          </motion.button>
        </SelectChoiceButton>
      </motion.div>
      <CustomChoiceVoice customChoice={customChoice} kind={kind} />
      {customChoice.error && (
        <p
          role="alert"
          className="text-muted-foreground mt-6 max-w-xs text-center text-base leading-relaxed"
        >
          {customChoice.error}
        </p>
      )}
    </>
  );
}
