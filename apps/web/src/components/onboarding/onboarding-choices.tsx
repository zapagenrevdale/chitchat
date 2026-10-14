import { practiceLanguages } from "@chitchat/contracts";
import type { PracticeLanguage } from "@chitchat/contracts";
import { conversationSkills } from "@chitchat/contracts/conversation-goals";
import type { ConversationSkill } from "@chitchat/contracts/conversation-goals";
import { practiceLanguageLocales } from "@chitchat/contracts/languages";
import { Check } from "lucide-react";
import { Checkbox, RadioGroup } from "radix-ui";

import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { languageName, useOnboardingLocale } from "@/lib/onboarding-locale";
import { m } from "@/paraglide/messages";

import "./onboarding.css";

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
  "start-conversations": {
    title: m.skill_start_conversations_title,
    description: m.skill_start_conversations_description,
  },
  "conversation-flow": {
    title: m.skill_conversation_flow_title,
    description: m.skill_conversation_flow_description,
  },
  listening: {
    title: m.skill_listening_title,
    description: m.skill_listening_description,
  },
  sharing: {
    title: m.skill_sharing_title,
    description: m.skill_sharing_description,
  },
  "clear-expression": {
    title: m.skill_clear_expression_title,
    description: m.skill_clear_expression_description,
  },
  wit: { title: m.skill_wit_title, description: m.skill_wit_description },
  "respond-with-care": {
    title: m.skill_respond_with_care_title,
    description: m.skill_respond_with_care_description,
  },
  "self-advocacy": {
    title: m.skill_self_advocacy_title,
    description: m.skill_self_advocacy_description,
  },
  disagreement: {
    title: m.skill_disagreement_title,
    description: m.skill_disagreement_description,
  },
  clarification: {
    title: m.skill_clarification_title,
    description: m.skill_clarification_description,
  },
  "end-conversations": {
    title: m.skill_end_conversations_title,
    description: m.skill_end_conversations_description,
  },
} satisfies Record<
  ConversationSkill,
  {
    title: typeof m.skill_listening_title;
    description: typeof m.skill_listening_description;
  }
>;

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
      {suggested.length > 0 && (
        <p className="text-muted-foreground mb-5 text-sm leading-relaxed">
          {m.skills_suggested_intro({}, { locale })}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {conversationSkills.map(({ id }) => {
          const { title, description } = skillMessages[id];
          const selected = value.includes(id);
          return (
            <Checkbox.Root
              key={id}
              checked={selected}
              disabled={!selected && value.length >= 3}
              aria-labelledby={`${id}-title`}
              aria-describedby={`${id}-description${suggested.includes(id) ? ` ${id}-suggested` : ""}`}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value, id]
                    : value.filter((skill) => skill !== id)
                )
              }
              className="onboarding-choice flex items-start gap-3 rounded-2xl border p-4 text-start"
            >
              <img
                src={`/images/onboarding/skills/${id}.png`}
                alt=""
                aria-hidden="true"
                width={32}
                height={32}
                className="size-8 shrink-0 object-contain"
              />
              <span className="flex min-w-0 flex-1 flex-col self-stretch">
                <span
                  id={`${id}-title`}
                  className="text-base leading-snug font-medium"
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
                  <span className="mt-auto pt-3">
                    <Badge
                      id={`${id}-suggested`}
                      variant="primary-light"
                      radius="full"
                    >
                      {m.skill_suggested({}, { locale })}
                    </Badge>
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
        aria-live="polite"
        aria-atomic="true"
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
