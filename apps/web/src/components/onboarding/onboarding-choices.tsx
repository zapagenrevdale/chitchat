import { practiceLanguages } from "@chitchat/contracts";
import type { PracticeLanguage } from "@chitchat/contracts";
import { conversationSkills } from "@chitchat/contracts/conversation-goals";
import type { ConversationSkill } from "@chitchat/contracts/conversation-goals";
import { practiceLanguageLocales } from "@chitchat/contracts/languages";
import {
  AudioLines,
  Check,
  Ear,
  HeartHandshake,
  Lightbulb,
  MessageCircle,
  MessagesSquare,
  Smile,
  Sparkles,
} from "lucide-react";
import { Checkbox, RadioGroup } from "radix-ui";

import { Button } from "@/components/ui/button";
import { languageName, useOnboardingLocale } from "@/lib/onboarding-locale";
import { m } from "@/paraglide/messages";

const firstLanguages: PracticeLanguage[] = [
  "English",
  "Japanese",
  "Korean",
  "Filipino",
];
const moreLanguages: PracticeLanguage[] = [
  "Spanish",
  "French",
  "Chinese",
  "German",
  "Portuguese",
  "Italian",
  "Arabic",
  "Hindi",
];
const orderedLanguages = [
  ...firstLanguages,
  ...moreLanguages,
  ...practiceLanguages.filter(
    (language) =>
      !firstLanguages.includes(language) && !moreLanguages.includes(language)
  ),
];
const languageFlags: Record<PracticeLanguage, string> = {
  Arabic: "sa",
  Chinese: "cn",
  Danish: "dk",
  Dutch: "nl",
  English: "us",
  Filipino: "ph",
  French: "fr",
  German: "de",
  Greek: "gr",
  Hebrew: "il",
  Hindi: "in",
  Indonesian: "id",
  Italian: "it",
  Japanese: "jp",
  Korean: "kr",
  Norwegian: "no",
  Persian: "ir",
  Polish: "pl",
  Portuguese: "pt",
  Russian: "ru",
  Spanish: "es",
  Swedish: "se",
  Thai: "th",
  Turkish: "tr",
  Ukrainian: "ua",
  Vietnamese: "vn",
};

export function OnboardingLanguages({
  value,
  onChange,
}: {
  value: PracticeLanguage;
  onChange: (language: PracticeLanguage) => void;
}) {
  const locale = useOnboardingLocale();
  return (
    <div className="onboarding-language-list mx-auto w-full max-w-lg">
      <RadioGroup.Root
        aria-label={m.practice_language({}, { locale })}
        value={value}
        onValueChange={(language) => onChange(language as PracticeLanguage)}
        className="grid gap-3 px-1 pt-1 pb-48"
      >
        {orderedLanguages.map((language) => (
          <Button
            key={language}
            asChild
            variant="secondary"
            className="onboarding-action onboarding-language-option mx-auto min-h-16 w-full max-w-xs justify-start gap-4 rounded-2xl px-5 py-3 text-start"
          >
            <RadioGroup.Item
              value={language}
              aria-label={languageName(practiceLanguageLocales[language])}
            >
              <img
                src={`/images/flags/${languageFlags[language]}.svg`}
                alt=""
                aria-hidden="true"
                width={36}
                height={36}
                className="size-9 shrink-0"
              />
              <span className="text-xl font-medium">
                {languageName(practiceLanguageLocales[language])}
              </span>
              <span
                aria-hidden="true"
                className="onboarding-language-check text-primary ms-auto flex size-6 shrink-0 items-center justify-center"
              >
                <Check className="size-5" strokeWidth={2} />
              </span>
            </RadioGroup.Item>
          </Button>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

const skillMessages = {
  "smooth-speaking": {
    title: m.skill_smooth_speaking_title,
    description: m.skill_smooth_speaking_description,
  },
  "thinking-on-your-feet": {
    title: m.skill_thinking_on_your_feet_title,
    description: m.skill_thinking_on_your_feet_description,
  },
  listening: {
    title: m.skill_listening_title,
    description: m.skill_listening_description,
  },
  "situational-response": {
    title: m.skill_situational_response_title,
    description: m.skill_situational_response_description,
  },
  wit: { title: m.skill_wit_title, description: m.skill_wit_description },
  "clear-expression": {
    title: m.skill_clear_expression_title,
    description: m.skill_clear_expression_description,
  },
  "conversation-flow": {
    title: m.skill_conversation_flow_title,
    description: m.skill_conversation_flow_description,
  },
};

const skillIcons = {
  "smooth-speaking": AudioLines,
  "thinking-on-your-feet": Lightbulb,
  listening: Ear,
  "situational-response": HeartHandshake,
  wit: Smile,
  "clear-expression": MessageCircle,
  "conversation-flow": MessagesSquare,
};

export function OnboardingSkills({
  value,
  suggested,
  onChange,
}: {
  value: ConversationSkill[];
  suggested: ConversationSkill[];
  onChange: (skills: ConversationSkill[]) => void;
}) {
  const locale = useOnboardingLocale();
  return (
    <fieldset aria-describedby="skill-count" className="w-full">
      <legend className="sr-only">{m.skills_legend({}, { locale })}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {conversationSkills.map(({ id }) => {
          const { title, description } = skillMessages[id];
          const selected = value.includes(id);
          const Icon = skillIcons[id];
          return (
            <Checkbox.Root
              key={id}
              checked={selected}
              disabled={!selected && value.length >= 3}
              aria-labelledby={`${id}-title`}
              aria-describedby={`${id}-description`}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value, id]
                    : value.filter((skill) => skill !== id)
                )
              }
              className="onboarding-choice flex items-start gap-3 rounded-2xl border p-4 text-start"
            >
              <Icon
                aria-hidden="true"
                className="text-muted-foreground mt-1 size-5 shrink-0"
                strokeWidth={1.5}
              />
              <span className="min-w-0 flex-1">
                <span
                  id={`${id}-title`}
                  className="block text-base leading-snug font-medium"
                >
                  {title({}, { locale })}
                </span>
                <span
                  id={`${id}-description`}
                  className="text-muted-foreground mt-1 block text-sm leading-relaxed"
                >
                  {description({}, { locale })}
                </span>
                {suggested.includes(id) && (
                  <span className="text-primary mt-2 flex items-center gap-1 text-xs font-medium">
                    <Sparkles aria-hidden="true" className="size-3" />
                    {m.skill_suggested({}, { locale })}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${selected ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}
              >
                <Checkbox.Indicator>
                  <Check className="size-3.5" />
                </Checkbox.Indicator>
              </span>
            </Checkbox.Root>
          );
        })}
      </div>
      <output
        id="skill-count"

        className="text-muted-foreground mt-4 text-center text-sm"
      >
        {m.skills_count(
          { count: new Intl.NumberFormat(locale).format(value.length) },
          { locale }
        )}
        {value.length === 3
          ? ` · ${m.skills_full({}, { locale })}`
          : ` · ${m.skills_change({}, { locale })}`}
      </output>
    </fieldset>
  );
}
