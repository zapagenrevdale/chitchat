import { AudioLines } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

export function TalkButton(props: ComponentProps<typeof motion.button>) {
  const reducedMotion = useReducedMotion();
  return (
    <Button
      asChild
      variant="outline"
      size="icon"
      className="border-border bg-card text-foreground hover:bg-muted size-14 touch-manipulation rounded-full shadow-[0_2px_12px_#0000000a] transition-colors active:not-aria-[haspopup]:translate-y-0"
    >
      <motion.button
        type="button"
        whileTap={reducedMotion ? undefined : { scale: 0.94 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        {...props}
      >
        <AudioLines aria-hidden="true" className="size-6" strokeWidth={2.25} />
      </motion.button>
    </Button>
  );
}
