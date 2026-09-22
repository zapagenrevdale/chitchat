import { Check } from "lucide-react";
import { motion } from "motion/react";
import type { Transition } from "motion/react";
import { Checkbox } from "radix-ui";
import type { Ref } from "react";

export function PracticeChecklistItem({
  name,
  layoutId,
  avatar,
  avatarLayoutId,
  transition,
  animate,
  disabled,
  onEdit,
  buttonRef,
}: {
  name: string;
  layoutId?: string;
  avatar?: string;
  avatarLayoutId?: string;
  transition: Transition;
  animate: boolean;
  disabled: boolean;
  onEdit: (animate: boolean) => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <li>
      <Checkbox.Root
        asChild
        checked
        disabled={disabled}
        onClick={(event) => onEdit(event.detail > 0)}
      >
        <motion.button
          ref={buttonRef}
          type="button"
          className="focus-visible:ring-ring/50 relative flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
          whileTap={animate ? { scale: 0.98 } : undefined}
          transition={transition}
        >
          <Checkbox.Indicator asChild>
            <motion.span
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-[18px] shrink-0 items-center justify-center rounded-[5px]"
              initial={{ opacity: 0, scale: animate ? 0.9 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...transition, delay: animate ? 0.12 : 0 }}
            >
              <Check className="size-3" strokeWidth={2.5} />
            </motion.span>
          </Checkbox.Indicator>
          {avatar && (
            <motion.img
              src={avatar}
              alt=""
              width={28}
              height={28}
              draggable={false}
              layoutId={avatarLayoutId}
              transition={transition}
              className="bg-muted relative size-7 shrink-0 object-cover"
              style={{ borderRadius: "50%" }}
            />
          )}
          <motion.span
            layoutId={layoutId}
            transition={transition}
            className="relative min-w-0 text-base leading-snug font-medium tracking-[-0.02em] wrap-anywhere"
          >
            {name}
          </motion.span>
        </motion.button>
      </Checkbox.Root>
    </li>
  );
}
