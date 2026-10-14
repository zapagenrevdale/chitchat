import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant" | "system";
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex max-w-[85%] items-end gap-2",
        from === "user" ? "is-user self-end" : "is-assistant self-start",
        className
      )}
      {...props}
    />
  );
}

export function MessageContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl px-4 py-3 text-lg leading-relaxed wrap-anywhere whitespace-pre-wrap",
        "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground group-[.is-user]:rounded-br-md",
        "group-[.is-assistant]:bg-muted group-[.is-assistant]:rounded-bl-md",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
