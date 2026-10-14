import type { ComponentProps, FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface PromptInputMessage {
  text: string;
}
type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
};

export function PromptInput({ onSubmit, ...props }: PromptInputProps) {
  return (
    <form
      {...props}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        );
        const text = new FormData(form).get("message");
        if (
          submitButton?.disabled ||
          typeof text !== "string" ||
          !text.trim()
        ) {
          return;
        }
        try {
          await onSubmit({ text }, event);
        } catch {
          // The caller reports errors and owns the retryable draft.
        }
      }}
    />
  );
}

export function PromptInputTextarea({
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: ComponentProps<typeof Textarea>) {
  const [isComposing, setIsComposing] = useState(false);
  return (
    <Textarea
      name="message"
      {...props}
      onCompositionStart={(event) => {
        setIsComposing(true);
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        setIsComposing(false);
        onCompositionEnd?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.key !== "Enter" ||
          event.shiftKey ||
          isComposing ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229
        ) {
          return;
        }
        event.preventDefault();
        const { form } = event.currentTarget;
        const submitButton = form?.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        );
        if (!submitButton?.disabled) {
          form?.requestSubmit();
        }
      }}
    />
  );
}

export function PromptInputSubmit(props: ComponentProps<typeof Button>) {
  return <Button size="icon-sm" type="submit" {...props} />;
}
