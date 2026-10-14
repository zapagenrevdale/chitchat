import { Send } from "lucide-react";
import type { Ref } from "react";

import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

export function ChatInput({
  value,
  onChange,
  onSend,
  label,
  placeholder,
  sendLabel,
  maxLength,
  inputRef,
  describedBy,
  disabled = false,
}: {
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  label: string;
  placeholder: string;
  sendLabel: string;
  maxLength?: number;
  inputRef?: Ref<HTMLTextAreaElement>;
  describedBy?: string;
}) {
  function send() {
    if (!disabled && value.trim()) {
      return onSend();
    }
  }
  return (
    <PromptInput
      className="bg-card border-input focus-within:border-ring focus-within:ring-ring/50 flex items-end gap-2 rounded-2xl border p-2 transition-colors focus-within:ring-2"
      onSubmit={send}
    >
      <PromptInputTextarea
        disabled={disabled}
        ref={inputRef}
        aria-label={label}
        aria-describedby={describedBy}
        placeholder={placeholder}
        maxLength={maxLength}
        dir="auto"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="field-sizing-content max-h-64 min-h-12 min-w-0 resize-none border-0 bg-transparent px-2 py-0 text-base leading-6 focus-visible:ring-0"
      />
      <PromptInputSubmit
        type="submit"
        size="icon-sm"
        className="rounded-full"
        aria-label={sendLabel}
        disabled={disabled || !value.trim()}
      >
        <Send aria-hidden="true" />
      </PromptInputSubmit>
    </PromptInput>
  );
}
