import { ArrowDown } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Conversation({
  className,
  ...props
}: ComponentProps<typeof StickToBottom>) {
  const reducedMotion = useReducedMotion();
  return (
    <StickToBottom
      className={cn("relative min-h-0 flex-1 overflow-hidden", className)}
      initial="instant"
      resize={reducedMotion ? "instant" : "smooth"}
      {...props}
    />
  );
}

type ConversationContentProps = ComponentProps<"div"> & {
  contentClassName?: string;
};

// The library's Content puts attributes on the inner content. Put log semantics
// and keyboard focus on its actual scroll viewport instead.
export function ConversationContent({
  children,
  className,
  contentClassName,
  ...props
}: ConversationContentProps) {
  const { scrollRef, contentRef } = useStickToBottomContext();
  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard scrolling needs focus on the viewport.
      tabIndex={0}
      className={cn(
        "h-full w-full overflow-y-auto overscroll-contain",
        className
      )}
      {...props}
    >
      <div ref={contentRef} className={cn("flex flex-col", contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export function ConversationScrollButton({
  className,
  "aria-label": label = "Jump to latest message",
  ...props
}: ComponentProps<typeof Button>) {
  const { isAtBottom, scrollToBottom, scrollRef } = useStickToBottomContext();
  const reducedMotion = useReducedMotion();
  return (
    !isAtBottom && (
      <Button
        className={cn(
          "bg-background absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full",
          className
        )}
        onClick={() => {
          void scrollToBottom({
            animation: reducedMotion ? "instant" : "smooth",
          });
          scrollRef.current?.focus({ preventScroll: true });
        }}
        size="icon"
        type="button"
        variant="outline"
        aria-label={label}
        {...props}
      >
        <ArrowDown aria-hidden="true" className="size-4" />
      </Button>
    )
  );
}
