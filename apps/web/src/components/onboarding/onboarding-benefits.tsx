import type { OnboardingBenefit } from "@chitchat/contracts/onboarding";
import {
  MessageCircle,
  MessagesSquare,
  Lightbulb,
  Ear,
  BookOpen,
  Speech,
  AudioLines,
  BriefcaseBusiness,
  HeartHandshake,
  Smile,
  Languages,
  Sparkles,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useOnboardingLocale } from "@/lib/onboarding-locale";
import { m } from "@/paraglide/messages";

const benefits = {
  "start-conversations": {
    title: m.help_start_conversations_title,
    text: m.help_start_conversations_text,
    detail: m.help_start_conversations_detail,
    icon: MessageCircle,
  },
  "keep-it-going": {
    title: m.help_keep_it_going_title,
    text: m.help_keep_it_going_text,
    detail: m.help_keep_it_going_detail,
    icon: MessagesSquare,
  },
  "think-on-your-feet": {
    title: m.help_think_on_your_feet_title,
    text: m.help_think_on_your_feet_text,
    detail: m.help_think_on_your_feet_detail,
    icon: Lightbulb,
  },
  "listen-and-connect": {
    title: m.help_listen_and_connect_title,
    text: m.help_listen_and_connect_text,
    detail: m.help_listen_and_connect_detail,
    icon: Ear,
  },
  "tell-stories": {
    title: m.help_tell_stories_title,
    text: m.help_tell_stories_text,
    detail: m.help_tell_stories_detail,
    icon: BookOpen,
  },
  "express-yourself": {
    title: m.help_express_yourself_title,
    text: m.help_express_yourself_text,
    detail: m.help_express_yourself_detail,
    icon: Speech,
  },
  "speak-smoothly": {
    title: m.help_speak_smoothly_title,
    text: m.help_speak_smoothly_text,
    detail: m.help_speak_smoothly_detail,
    icon: AudioLines,
  },
  "work-conversations": {
    title: m.help_work_conversations_title,
    text: m.help_work_conversations_text,
    detail: m.help_work_conversations_detail,
    icon: BriefcaseBusiness,
  },
  "handle-disagreement": {
    title: m.help_handle_disagreement_title,
    text: m.help_handle_disagreement_text,
    detail: m.help_handle_disagreement_detail,
    icon: HeartHandshake,
  },
  "playful-conversations": {
    title: m.help_playful_conversations_title,
    text: m.help_playful_conversations_text,
    detail: m.help_playful_conversations_detail,
    icon: Smile,
  },
  "everyday-language": {
    title: m.help_everyday_language_title,
    text: m.help_everyday_language_text,
    detail: m.help_everyday_language_detail,
    icon: Languages,
  },
  "useful-feedback": {
    title: m.help_useful_feedback_title,
    text: m.help_useful_feedback_text,
    detail: m.help_useful_feedback_detail,
    icon: Sparkles,
  },
};

const colors = [
  "bg-info/10 text-info-foreground",
  "bg-warning/20 text-warning-foreground",
  "bg-success/10 text-success-foreground",
];

export function OnboardingBenefits({
  ids,
}: {
  ids: readonly OnboardingBenefit[];
}) {
  const locale = useOnboardingLocale();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {ids.map((id, index) => {
        const { title, text, detail, icon: Icon } = benefits[id];
        return (
          <Card key={id} className="rounded-3xl border py-5 shadow-none ring-0">
            <CardContent className="flex h-full flex-col items-start px-5">
              <span
                className={`mb-5 inline-flex size-11 items-center justify-center rounded-xl ${colors[index]}`}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </span>
              <h2 className="text-lg font-medium">{title({}, { locale })}</h2>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                {text({}, { locale })}
              </p>
              <p className="font-handwriting mt-auto pt-5 text-sm">
                {detail({}, { locale })}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
