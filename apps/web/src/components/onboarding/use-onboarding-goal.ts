import type {
  OnboardingMessage,
  OnboardingTurn,
  OnboardingTurnRequest,
} from "@chitchat/contracts/onboarding";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { replyToOnboarding } from "@/lib/practice-api";

function leaveTimeToRead(signal: AbortSignal) {
  // A cancellable reading delay before an automatic screen transition.
  // oxlint-disable-next-line promise/avoid-new
  return new Promise<void>((resolve) => {
    let timer = 0;
    function done() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    timer = window.setTimeout(done, 1800);
    signal.addEventListener("abort", done, { once: true });
  });
}

export function useOnboardingGoal({
  initialMessages,
  name,
  language,
  onReply,
  onReady,
}: {
  initialMessages: OnboardingMessage[];
  name: string;
  language: OnboardingTurnRequest["language"];
  onReply: (messages: OnboardingMessage[], turn: OnboardingTurn) => void;
  onReady: (turn: OnboardingTurn) => void;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const history = useRef(initialMessages);
  const [phase, setPhase] = useState<"idle" | "thinking">("idle");
  const [error, setError] = useState(false);
  const [result, setResult] = useState<OnboardingTurn | null>(null);
  const active = useRef<AbortController | null>(null);
  const pendingNavigation = useRef<OnboardingTurn | null>(null);
  const stop = useCallback(() => {
    const previous = active.current;
    active.current = null;
    previous?.abort();
    setMessages(history.current);
    setPhase("idle");
  }, []);
  const advance = useEffectEvent(() => {
    const turn = pendingNavigation.current;
    pendingNavigation.current = null;
    if (turn) {
      onReady(turn);
    }
  });
  useEffect(() => {
    function suspend() {
      stop();
      setMessages(history.current);
      setPhase("idle");
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted) {
        advance();
      }
    }
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", restore);
      pendingNavigation.current = null;
      stop();
    };
  }, [stop]);

  function reset() {
    pendingNavigation.current = null;
    stop();
    history.current = [];
    setMessages([]);
    setPhase("idle");
    setResult(null);
    setError(false);
  }

  async function submit(answer: string) {
    if (
      !answer.trim() ||
      active.current ||
      pendingNavigation.current ||
      history.current.length >= 6
    ) {
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    const next: OnboardingMessage[] = [
      ...history.current,
      { role: "user", text: answer.trim() },
    ];
    setMessages(next);
    setPhase("thinking");
    setError(false);
    setResult(null);
    try {
      const turn = await replyToOnboarding(
        { name, language, messages: next },
        signal,
        (reply) => {
          if (!signal.aborted && active.current === controller) {
            setMessages(
              reply ? [...next, { role: "assistant", text: reply }] : next
            );
          }
        }
      );
      signal.throwIfAborted();
      if (active.current !== controller) {
        return;
      }
      const conversation: OnboardingMessage[] = [
        ...next,
        { role: "assistant", text: turn.reply },
      ];
      history.current = conversation;
      setMessages(conversation);
      onReply(conversation, turn);
      setResult(turn);
      pendingNavigation.current = turn.status === "clarify" ? null : turn;
      await leaveTimeToRead(signal);
      signal.throwIfAborted();
      if (active.current === controller && pendingNavigation.current === turn) {
        pendingNavigation.current = null;
        onReady(turn);
      }
    } catch {
      if (!signal.aborted && active.current === controller) {
        setMessages(next);
        setError(true);
      }
    }
    if (active.current === controller) {
      active.current = null;
      setPhase("idle");
    }
  }

  return {
    messages,
    phase,
    error,
    result,
    submit,
    reset,
    stop,
  };
}
