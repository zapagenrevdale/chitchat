import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SelectChoiceButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className={cn(
        "min-w-40 transition-colors duration-150 active:not-aria-[haspopup]:translate-y-0",
        className
      )}
      {...props}
    />
  );
}
