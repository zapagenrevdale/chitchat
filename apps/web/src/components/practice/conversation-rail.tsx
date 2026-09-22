import { useReducedMotion } from "motion/react";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { Scrollspy } from "@/components/reui/scrollspy";
import type { PracticeMessage } from "@/lib/practice-live";

import "./conversation-rail.css";

const MAX_MARKERS = 10;

// Endpoint-inclusive uniform sampling (linspace), rounded to message indexes.
// https://numpy.org/doc/stable/reference/generated/numpy.linspace.html
export function sampleMessageIndexes(count: number, capacity: number) {
  const size = Math.min(count, Math.max(2, Math.floor(capacity)));
  return Array.from({ length: size }, (_, index) =>
    size < 2 ? 0 : Math.round((index * (count - 1)) / (size - 1))
  );
}

export function ConversationRail({
  messages,
  transcriptId,
  targetRef,
  partnerName,
  onNavigate,
}: {
  messages: PracticeMessage[];
  transcriptId: string;
  targetRef: RefObject<HTMLDivElement | null>;
  partnerName: string;
  onNavigate: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const rail = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(MAX_MARKERS);

  useEffect(() => {
    const element = rail.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const height = element.clientHeight;
      if (height > 0) {
        // Each marker occupies 10px, matching conversation-rail-item.
        setCapacity(
          Math.min(MAX_MARKERS, Math.max(2, Math.floor(height / 10)))
        );
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const indexes = sampleMessageIndexes(messages.length, capacity);

  return (
    <nav
      aria-label="Conversation navigation"
      className="relative w-9 shrink-0 self-stretch"
    >
      <div ref={rail} className="absolute inset-0">
        <Scrollspy
          targetRef={targetRef}
          history={false}
          smooth={!reducedMotion}
          offset={16}
          className="conversation-rail flex h-full flex-col justify-center overflow-hidden"
        >
          {messages.length > 1 &&
            indexes.map((index) => {
              const message = messages[index];
              const label = `${message.speaker === "user" ? "You" : partnerName}: ${message.text}`;
              return (
                <button
                  key={message.id}
                  type="button"
                  data-scrollspy-anchor={`${transcriptId}-${message.id}`}
                  aria-label={`Jump to message ${index + 1}. ${label}`}
                  title={label}
                  onClickCapture={onNavigate}
                  className="conversation-rail-item"
                >
                  <span aria-hidden="true" />
                </button>
              );
            })}
        </Scrollspy>
      </div>
    </nav>
  );
}
