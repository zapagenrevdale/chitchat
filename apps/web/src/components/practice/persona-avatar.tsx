import { motion } from "motion/react";
import type { Transition } from "motion/react";

export function PersonaAvatar({
  src,
  selected = false,
  layoutId,
  transition,
}: {
  src: string;
  selected?: boolean;
  layoutId?: string;
  transition?: Transition;
}) {
  return (
    <motion.img
      src={src}
      alt=""
      width={56}
      height={56}
      draggable={false}
      layoutId={layoutId}
      transition={transition}
      className={`bg-muted relative size-14 shrink-0 object-cover ${selected ? "ring-primary ring-offset-background ring-2 ring-offset-4" : ""}`}
      style={{ borderRadius: "50%" }}
    />
  );
}
