import { practiceLanguages, practiceLanguageSchema } from "@chitchat/contracts";
import type { PracticeLanguage } from "@chitchat/contracts";
import { useId } from "react";

export function PracticeLanguagePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PracticeLanguage;
  onChange: (language: PracticeLanguage) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-base">
      <label htmlFor={id} className="text-muted-foreground">
        Practice language
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        className="border-input bg-card focus-visible:ring-ring/50 min-h-12 rounded-xl border px-4 outline-none focus-visible:ring-2"
        onChange={(event) =>
          onChange(practiceLanguageSchema.parse(event.target.value))
        }
      >
        {practiceLanguages.map((language) => (
          <option key={language} value={language}>
            {language}
          </option>
        ))}
      </select>
    </div>
  );
}
