import { onboardingBenefitIds } from "@chitchat/contracts/onboarding";
import type { OnboardingBenefit } from "@chitchat/contracts/onboarding";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOnboardingLocale } from "@/lib/onboarding-locale";
import { m } from "@/paraglide/messages";

const benefits = {
  "start-conversations": {
    title: m.help_start_conversations_title,
    text: m.help_start_conversations_text,
  },
  "keep-it-going": {
    title: m.help_keep_it_going_title,
    text: m.help_keep_it_going_text,
  },
  "think-on-your-feet": {
    title: m.help_think_on_your_feet_title,
    text: m.help_think_on_your_feet_text,
  },
  "listen-and-connect": {
    title: m.help_listen_and_connect_title,
    text: m.help_listen_and_connect_text,
  },
  "tell-stories": {
    title: m.help_tell_stories_title,
    text: m.help_tell_stories_text,
  },
  "express-yourself": {
    title: m.help_express_yourself_title,
    text: m.help_express_yourself_text,
  },
  "speak-smoothly": {
    title: m.help_speak_smoothly_title,
    text: m.help_speak_smoothly_text,
  },
  "work-conversations": {
    title: m.help_work_conversations_title,
    text: m.help_work_conversations_text,
  },
  "handle-disagreement": {
    title: m.help_handle_disagreement_title,
    text: m.help_handle_disagreement_text,
  },
  "playful-conversations": {
    title: m.help_playful_conversations_title,
    text: m.help_playful_conversations_text,
  },
  "everyday-language": {
    title: m.help_everyday_language_title,
    text: m.help_everyday_language_text,
  },
  "useful-feedback": {
    title: m.help_useful_feedback_title,
    text: m.help_useful_feedback_text,
  },
  "clear-up-misunderstandings": {
    title: m.help_clear_up_misunderstandings_title,
    text: m.help_clear_up_misunderstandings_text,
  },
  "everyday-tasks": {
    title: m.help_everyday_tasks_title,
    text: m.help_everyday_tasks_text,
  },
  "respond-with-care": {
    title: m.help_respond_with_care_title,
    text: m.help_respond_with_care_text,
  },
  "end-conversations": {
    title: m.help_end_conversations_title,
    text: m.help_end_conversations_text,
  },
};

function MoreBenefits({
  ids,
  onClose,
}: {
  ids: readonly OnboardingBenefit[];
  onClose: () => void;
}) {
  const locale = useOnboardingLocale();
  const isRtl = locale === "ar" || locale === "fa" || locale === "he";
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const scrollId = useId();
  const scrollRef = useRef<HTMLElement>(null);
  const [pages, setPages] = useState<
    { id: OnboardingBenefit; offset: number }[]
  >([]);
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const scroller = element;
    let scrollPages: { id: OnboardingBenefit; offset: number }[] = [];
    function updateActivePage() {
      const position = Math.abs(scroller.scrollLeft);
      let nearest = 0;
      for (const [index, page] of scrollPages.entries()) {
        if (
          Math.abs(page.offset - position) <
          Math.abs(scrollPages[nearest].offset - position)
        ) {
          nearest = index;
        }
      }
      setActivePage(nearest);
    }
    function updatePages() {
      const cards = [...scroller.querySelectorAll("li")];
      const first = cards[0]?.getBoundingClientRect();
      if (!first) {
        return;
      }
      const width =
        scroller.querySelector("ul")?.clientWidth ?? scroller.clientWidth;
      const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scrollPages = [];
      let pageEnd = -1;
      for (const [index, card] of cards.entries()) {
        const bounds = card.getBoundingClientRect();
        const offset = isRtl
          ? first.right - bounds.right
          : bounds.left - first.left;
        if (scrollPages.length > 0 && offset + bounds.width <= pageEnd + 1) {
          continue;
        }
        const clampedOffset = Math.min(offset, maximum);
        if (scrollPages.at(-1)?.offset === clampedOffset) {
          break;
        }
        scrollPages.push({ id: ids[index], offset: clampedOffset });
        pageEnd = offset + width;
        if (clampedOffset === maximum) {
          break;
        }
      }
      setPages(scrollPages);
      updateActivePage();
    }
    const observer = new ResizeObserver(updatePages);
    observer.observe(element);
    for (const card of element.querySelectorAll("li")) {
      observer.observe(card);
    }
    updatePages();
    element.addEventListener("scroll", updateActivePage, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", updateActivePage);
    };
  }, [ids, isRtl]);

  function scroll(offset: number, pointer: boolean) {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({
      left: offset * (isRtl ? -1 : 1),
      behavior: pointer && !reducedMotion ? "smooth" : "instant",
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-medium">
          {m.help_more_title({}, { locale })}
        </h2>
        <div className="flex max-w-1/2 shrink-0 flex-wrap justify-end">
          {pages.map((page, index) => (
            <Button
              key={page.id}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-5 rounded-full pointer-coarse:w-6"
              aria-label={benefits[page.id].title({}, { locale })}
              aria-controls={scrollId}
              aria-current={index === activePage ? "true" : undefined}
              onKeyDown={handleKeyDown}
              onClick={(event) => scroll(page.offset, event.detail > 0)}
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${index === activePage ? "bg-primary" : "bg-muted-foreground/40"}`}
              />
            </Button>
          ))}
        </div>
      </div>
      {/* Keyboard focus enables native scrolling; Escape returns to the disclosure. */}
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
      <section
        ref={scrollRef}
        id={scrollId}
        aria-labelledby={titleId}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="focus-visible:ring-ring/50 min-w-0 snap-x snap-mandatory scroll-px-1 overflow-x-auto overscroll-x-contain rounded-3xl p-1 pb-3 outline-none focus-visible:ring-3"
      >
        <ul className="flex gap-3">
          {ids.map((id) => (
            <li key={id} className="w-44 shrink-0 snap-start sm:w-48">
              <Card className="h-full rounded-3xl border py-4 shadow-none ring-0">
                <CardContent className="flex flex-col items-start gap-3 px-4">
                  <img
                    src={`/images/onboarding/benefits/${id}.png`}
                    alt=""
                    width={80}
                    height={80}
                    loading="lazy"
                    className="size-20 object-contain"
                  />
                  <h3 className="text-base font-medium">
                    {benefits[id].title({}, { locale })}
                  </h3>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
    </div>
  );
}

export function OnboardingBenefits({
  ids,
}: {
  ids: readonly OnboardingBenefit[];
}) {
  const locale = useOnboardingLocale();
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const animateExpansion = useRef(false);
  const panelId = useId();
  const remaining = onboardingBenefitIds.filter((id) => !ids.includes(id));

  useEffect(() => {
    if (expanded) {
      panelRef.current?.scrollIntoView({
        behavior: animateExpansion.current ? "smooth" : "instant",
        block: "start",
      });
    }
  }, [expanded]);

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {ids.map((id) => {
          const { title, text } = benefits[id];
          return (
            <Card
              key={id}
              className="rounded-3xl border py-5 shadow-none ring-0"
            >
              <CardContent className="flex h-full flex-col items-start px-5">
                <img
                  src={`/images/onboarding/benefits/${id}.png`}
                  alt=""
                  width={112}
                  height={112}
                  className="mb-4 size-28 object-contain"
                />
                <h2 className="text-lg font-medium">{title({}, { locale })}</h2>
                <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                  {text({}, { locale })}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {remaining.length > 0 && (
        <div className="min-w-0 space-y-4">
          <div className="flex justify-center">
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              className="h-auto text-center whitespace-normal"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={(event) => {
                animateExpansion.current = event.detail > 0 && !reducedMotion;
                setExpanded(!expanded);
              }}
            >
              {expanded
                ? m.help_show_less({}, { locale })
                : m.help_show_more({}, { locale })}
              {expanded ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronDown aria-hidden="true" />
              )}
            </Button>
          </div>
          <div
            ref={panelRef}
            id={panelId}
            hidden={!expanded}
            className="scroll-mt-24"
          >
            {expanded && (
              <MoreBenefits
                ids={remaining}
                onClose={() => {
                  triggerRef.current?.focus();
                  setExpanded(false);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
