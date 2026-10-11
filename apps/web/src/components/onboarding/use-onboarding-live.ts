import type { PracticeLanguage } from "@chitchat/contracts";
import type {
  OnboardingMessage,
  OnboardingTurn,
} from "@chitchat/contracts/onboarding";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { OnboardingLive } from "@/lib/onboarding-live";
import type {
  OnboardingLiveMessage,
  OnboardingLivePhase,
} from "@/lib/onboarding-live";

export function useOnboardingLive({
  name,
  language,
  onMessages,
  onResolved,
  autoStart = false,
}: {
  name: string;
  language: PracticeLanguage;
  onMessages: (messages: OnboardingMessage[]) => void;
  onResolved: (turn: OnboardingTurn & { status: "ready" | "choose" }) => void;
  autoStart?: boolean;
}) {
  const [phase, setPhase] = useState<OnboardingLivePhase | "interrupted">(
    "idle"
  );
  const [messages, setMessages] = useState<OnboardingLiveMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardingTurn | null>(null);
  const session = useRef<OnboardingLive | null>(null);
  const completed = useRef(false);
  const startOnMount = useRef(autoStart);
  const reportMessages = useRef(onMessages);
  const reportResolved = useRef(onResolved);
  useEffect(() => {
    reportMessages.current = onMessages;
    reportResolved.current = onResolved;
  }, [onMessages, onResolved]);
  const close = useCallback(() => {
    // Invalidate first: disposing audio and sockets may synchronously fire events.
    const previous = session.current;
    session.current = null;
    previous?.close();
  }, []);
  const stop = useCallback(() => {
    close();
    setPhase("idle");
  }, [close]);

  function start() {
    close();
    completed.current = false;
    setMessages([]);
    onMessages([]);
    setError(null);
    setResult(null);
    setPhase("connecting");
    try {
      const live = new OnboardingLive({
        onPhase: (nextPhase) => {
          if (session.current === live && !completed.current) {
            setPhase(nextPhase);
          }
        },
        onMessages: (visible, confirmed) => {
          if (session.current === live) {
            setMessages(visible);
            reportMessages.current(confirmed);
          }
        },
        onComplete: (turn) => {
          if (
            session.current === live &&
            !completed.current &&
            turn.status !== "clarify"
          ) {
            completed.current = true;
            setResult(turn);
            setPhase("ready");
            reportResolved.current({ ...turn, status: turn.status });
          }
        },
        onError: (message) => {
          if (session.current === live && !completed.current) {
            setError(message);
            setPhase("idle");
          }
        },
      });
      session.current = live;
      void live.start({ name, language });
    } catch {
      close();
      setError(
        "Couldn't start voice. Check your microphone and connection, then restart voice or switch to text."
      );
      setPhase("idle");
    }
  }

  const begin = useEffectEvent(start);
  useEffect(() => {
    if (startOnMount.current) {
      begin();
    }
    function suspend() {
      close();
      setPhase(completed.current ? "ready" : "interrupted");
    }
    window.addEventListener("pagehide", suspend);
    return () => {
      window.removeEventListener("pagehide", suspend);
      close();
    };
  }, [close]);

  return {
    phase,
    messages,
    error,
    result,
    start,
    stop,
    pause: () => session.current?.pause(),
    resume: () => session.current?.resume(),
    getInputVolume: () => session.current?.getInputVolume() ?? 0,
    getAnalyser: () => session.current?.getAnalyser() ?? null,
  };
}
