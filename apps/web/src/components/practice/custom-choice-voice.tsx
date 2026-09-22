import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { ChitAvatar } from "@/components/ui/chit-avatar";
import { LiveWaveform } from "@/components/ui/live-waveform";
import type { PracticeState } from "@/lib/practice-live";

import { TalkButton } from "./talk-button";
import type { useCustomChoice } from "./use-custom-choice";

const spring = { type: "spring", bounce: 0, duration: 0.4 } as const;

function voiceStatus(state: PracticeState) {
  if (state === "starting" || state === "reconnecting") {
    return "Connecting to Chit…";
  }
  if (state === "talking") {
    return "Chit is speaking";
  }
  return "Chit is listening";
}

export function CustomChoiceVoice({
  customChoice,
  kind,
}: {
  customChoice: Omit<ReturnType<typeof useCustomChoice>, "start"> & {
    start: () => Promise<void>;
  };
  kind: "place" | "situation";
}) {
  const { active, state, caption } = customChoice;
  const reducedMotion = useReducedMotion();
  const connecting = state === "starting" || state === "reconnecting";
  const avatarState = state === "talking" ? "speaking" : "listening";
  const startButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active) {
      closeButton.current?.focus({ preventScroll: true });
    } else if (wasActive.current) {
      startButton.current?.focus({ preventScroll: true });
    }
    wasActive.current = active;
  }, [active]);

  return (
    <>
      {!active && (
        <div className="fixed inset-x-0 bottom-[calc(2rem+env(safe-area-inset-bottom))] flex justify-center">
          <div className="relative">
            <div
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute right-10 bottom-4 flex w-32 origin-bottom-right scale-85 flex-col items-center sm:right-12 sm:w-40"
            >
              <span className="font-handwriting -rotate-6 text-lg leading-none whitespace-nowrap sm:text-xl">
                custom scenario
              </span>
              <svg
                viewBox="0 0 80 64"
                fill="none"
                className="mt-1 mr-2 h-16 w-20 self-end"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 4C5 25 25 45 64 54" />
                <path d="m51 39 13 15-20 3" />
              </svg>
            </div>
            <TalkButton
              ref={startButton}
              aria-label={`Describe a custom ${kind} with Chit`}
              title={`Describe a custom ${kind}`}
              onClick={() => {
                void customChoice.start();
              }}
            />
          </div>
        </div>
      )}
      <AnimatePresence initial={false}>
        {active && (
          <motion.section
            key="chit"
            aria-label={`Custom ${kind} conversation with Chit`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{
              duration: reducedMotion ? 0.15 : 0.5,
              ease: "easeOut",
            }}
            className="absolute top-[calc(50%-10rem)] flex w-full flex-col items-center gap-6 pb-8"
          >
            <div className="flex min-h-56 w-full flex-col items-center gap-3 text-center">
              <ChitAvatar
                size={88}
                state={connecting ? "thinking" : avatarState}
                label={voiceStatus(state)}
                getAnalyser={customChoice.getAnalyser}
                className="shrink-0"
              />
              <div className="flex w-full flex-1 flex-col items-center justify-center">
                {connecting && (
                  <p className="text-muted-foreground text-base">Just a sec…</p>
                )}
                {!connecting && caption.text && (
                  <>
                    {caption.speaker === "You" && (
                      <p className="text-muted-foreground mb-2 text-base font-medium">
                        You
                      </p>
                    )}
                    <p className="text-xl leading-relaxed tracking-[-0.02em] text-pretty wrap-anywhere">
                      {caption.text}
                    </p>
                  </>
                )}
              </div>
            </div>
            <LiveWaveform
              analyser={customChoice.getAnalyser()}
              active={!connecting && !reducedMotion}
              mode="static"
              height={48}
              barWidth={3}
              barGap={3}
              fadeEdges
              className="max-w-xs"
              aria-label={voiceStatus(state)}
            />
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive size-12 touch-manipulation rounded-full transition-colors active:not-aria-[haspopup]:translate-y-0"
            >
              <motion.button
                ref={closeButton}
                type="button"
                aria-label={`Cancel custom ${kind} conversation`}
                title="Cancel conversation"
                onClick={() => customChoice.cancel()}
                whileTap={reducedMotion ? undefined : { scale: 0.94 }}
                transition={spring}
              >
                <X aria-hidden="true" className="size-5" />
              </motion.button>
            </Button>
            <output className="sr-only">{voiceStatus(state)}</output>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
