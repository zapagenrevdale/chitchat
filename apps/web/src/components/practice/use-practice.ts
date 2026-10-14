import type { PracticeFeedback, PracticeSelection } from "@chitchat/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { PracticeGuided, emptyGuidedProgress } from "@/lib/practice-guided";
import { PracticeLive } from "@/lib/practice-live";
import type { PracticeSuggestion } from "@/lib/practice-live";
import type {
  PracticeMessage,
  PracticeState,
  PracticeTranscript,
} from "@/lib/practice-session";

export type { PracticeState } from "@/lib/practice-session";

export function usePractice() {
  const [guided, setGuided] = useState(emptyGuidedProgress);
  const [suggestion, setSuggestion] = useState<PracticeSuggestion | null>(null);
  const [state, setState] = useState<PracticeState>("idle");
  const [captionWarning, setCaptionWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<PracticeTranscript>({
    user: "",
    partner: "",
  });
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<PracticeMessage[]>([]);
  const [selection, setSelection] = useState<PracticeSelection | null>(null);
  const live = useRef<PracticeLive | PracticeGuided | null>(null);

  const close = useCallback(() => {
    live.current?.close();
    live.current = null;
  }, []);
  useEffect(() => {
    const onPageHide = () => {
      close();
      setState((current) => (current === "idle" ? "idle" : "ended"));
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      close();
    };
  }, [close]);

  async function start(nextSelection: PracticeSelection) {
    if (live.current) {
      return;
    }
    setSuggestion(null);
    setGuided(emptyGuidedProgress);
    setError(null);
    setCaptionWarning(null);
    setFeedback(null);
    setFeedbackError(null);
    setMuted(false);
    setMessages([]);
    setTranscript({ user: "", partner: "" });
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioWorkletNode === "undefined"
    ) {
      setError("Live voice needs a browser with microphone support on HTTPS.");
      return;
    }
    try {
      setSelection(nextSelection);
      const callbacks = {
        onState: (nextState: PracticeState) => {
          setState(nextState);
          if (nextState === "reviewing") {
            setMuted(true);
          }
        },
        onFeedback: setFeedback,
        onFeedbackError: setFeedbackError,
        onError: setError,
        onCaptionWarning: setCaptionWarning,
        onTranscript: setTranscript,
        onMessage: (message: PracticeMessage) => {
          setMessages((current) =>
            current.some(({ id }) => id === message.id)
              ? current.map((item) => (item.id === message.id ? message : item))
              : [...current, message]
          );
        },
      };
      const connection =
        nextSelection.mode === "guided"
          ? new PracticeGuided({ ...callbacks, onProgress: setGuided })
          : new PracticeLive({ ...callbacks, onSuggestion: setSuggestion });
      live.current = connection;
      await connection.start(nextSelection);
    } catch {
      close();
      setError("Couldn't open your audio device. Please try again.");
      setState("ended");
    }
  }

  return {
    guided,
    suggestion: suggestion?.text ?? "",
    suggestionPending: suggestion?.pending ?? false,
    suggestionError: suggestion?.error ?? null,
    suggestReply: () => {
      if (live.current instanceof PracticeLive) {
        return live.current.suggestReply();
      }
    },
    dismissSuggestion: () => {
      if (live.current instanceof PracticeLive) {
        live.current.dismissSuggestion();
      }
    },
    retryGuided: () => {
      if (live.current instanceof PracticeGuided) {
        live.current.retry();
      }
    },
    skipGuided: () => {
      if (live.current instanceof PracticeGuided) {
        live.current.skip();
      }
    },
    state,
    error,
    captionWarning,
    transcript,
    messages: messages.filter(({ text }) => text.trim()),
    selection,
    feedback,
    feedbackError,
    muted,
    start,
    toggleMute() {
      if (state !== "listening" && state !== "talking") {
        return;
      }
      live.current?.setMuted(!muted);
      setMuted(!muted);
    },
    stopSpeaking() {
      if (live.current instanceof PracticeLive) {
        live.current.stopSpeaking();
      }
    },
    end() {
      live.current?.finish();
    },
    reset() {
      close();
      setSuggestion(null);
      setGuided(emptyGuidedProgress);
      setState("idle");
      setError(null);
      setCaptionWarning(null);
      setFeedback(null);
      setFeedbackError(null);
      setMuted(false);
      setMessages([]);
      setSelection(null);
      setTranscript({ user: "", partner: "" });
    },
    getInputVolume: () => live.current?.getInputVolume() ?? 0,
    getAnalyser: () => live.current?.getAnalyser() ?? null,
    getOutputVolume: () => live.current?.getOutputVolume() ?? 0,
  };
}
