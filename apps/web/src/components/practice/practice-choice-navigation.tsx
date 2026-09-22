import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";

const arrowClassName =
  "text-muted-foreground size-12 touch-manipulation rounded-full transition-colors active:bg-muted active:text-foreground motion-safe:active:scale-95 active:not-aria-[haspopup]:translate-y-0";

export function PracticeChoiceNavigation({
  kind,
  name,
  choices,
  layoutId,
  transition,
  active = false,
  onBrowse,
}: {
  kind: string;
  name: string;
  choices: readonly { id: string; name: string }[];
  layoutId?: string;
  transition: Transition;
  active?: boolean;
  onBrowse: (direction: -1 | 1) => void;
}) {
  const reducedMotion = useReducedMotion();
  const displayName = kind === "situation" ? name.toLowerCase() : name;

  function handleArrowKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onBrowse(event.key === "ArrowLeft" ? -1 : 1);
    }
  }

  return (
    <motion.fieldset
      disabled={active}
      initial={false}
      animate={{ opacity: active ? 0 : 1 }}
      transition={
        reducedMotion
          ? { duration: 0.15 }
          : { type: "spring", bounce: 0, duration: 0.4 }
      }
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4"
    >
      <legend className="sr-only capitalize">{kind}</legend>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={arrowClassName}
        aria-label={`Previous ${kind}`}
        onClick={() => onBrowse(-1)}
        onKeyDown={handleArrowKey}
      >
        <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </Button>
      <output
        aria-label={`Selected ${kind}`}
        aria-live="polite"
        aria-atomic="true"
        className={`grid text-center leading-snug font-medium tracking-[-0.02em] text-balance wrap-anywhere transition-[font-size] duration-400 motion-reduce:transition-none ${active ? "text-sm" : "text-lg sm:text-xl"}`}
      >
        {choices.map((option) => (
          <span
            key={option.id}
            aria-hidden="true"
            data-label={
              kind === "situation" ? option.name.toLowerCase() : option.name
            }
            className="invisible col-start-1 row-start-1 before:content-[attr(data-label)]"
          />
        ))}
        <motion.span
          key={kind}
          layoutId={layoutId}
          transition={transition}
          className="relative col-start-1 row-start-1 place-self-center wrap-anywhere"
        >
          {displayName}
        </motion.span>
      </output>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={arrowClassName}
        aria-label={`Next ${kind}`}
        onClick={() => onBrowse(1)}
        onKeyDown={handleArrowKey}
      >
        <ChevronRight
          aria-hidden="true"
          className="size-5"
          strokeWidth={1.75}
        />
      </Button>
    </motion.fieldset>
  );
}
