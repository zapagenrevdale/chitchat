import type {
  CustomChoiceSummary,
  CustomPlaceSummary,
} from "@chitchat/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { PracticeLive } from "@/lib/practice-live";
import type { PracticeState, PracticeTranscript } from "@/lib/practice-live";

type ChoiceContext =
  | { kind: "place" }
  | { kind: "situation"; place: CustomPlaceSummary };

export function useCustomChoice(
  onPlaceComplete: (place: CustomPlaceSummary) => void,
  onSituationComplete: (situation: CustomChoiceSummary) => void
) {
  const [state, setState] = useState<PracticeState>("idle");
  const [placeSummary, setPlaceSummary] = useState<CustomPlaceSummary | null>(
    null
  );
  const [situationSummary, setSituationSummary] =
    useState<CustomChoiceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState({ speaker: "Chit", text: "" });
  const lastTranscript = useRef<PracticeTranscript>({ user: "", partner: "" });
  const live = useRef<PracticeLive | null>(null);

  const close = useCallback(() => {
    const connection = live.current;
    live.current = null;
    connection?.close();
  }, []);
  const cancel = useCallback(() => {
    close();
    setState("idle");
    setError(null);
  }, [close]);

  useEffect(() => {
    window.addEventListener("pagehide", cancel);
    return () => {
      window.removeEventListener("pagehide", cancel);
      close();
    };
  }, [cancel, close]);

  useEffect(() => {
    if (state === "idle" || state === "ended") {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, state]);

  async function start(nextContext: ChoiceContext) {
    if (live.current) {
      return;
    }
    setError(null);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioWorkletNode === "undefined"
    ) {
      setError("Chit needs a browser with microphone support on HTTPS.");
      return;
    }
    setState("starting");
    lastTranscript.current = { user: "", partner: "" };
    setCaption({ speaker: "Chit", text: "" });
    try {
      let phase = nextContext.kind;
      const connection = new PracticeLive({
        onState(next) {
          if (live.current === connection) {
            setState(next);
            if (next === "ended") {
              close();
            }
          }
        },
        onTranscript(next) {
          if (live.current === connection) {
            if (next.partner !== lastTranscript.current.partner) {
              setCaption({ speaker: "Chit", text: next.partner });
            } else if (next.user !== lastTranscript.current.user) {
              setCaption({ speaker: "You", text: next.user });
            }
            lastTranscript.current = next;
          }
        },
        onError(message) {
          if (live.current === connection) {
            setError(message);
          }
        },
        onPlaceSummary(place) {
          if (live.current === connection && phase === "place") {
            phase = "situation";
            setPlaceSummary(place);
            setSituationSummary(null);
            onPlaceComplete(place);
          }
        },
        onSituationSummary(situation) {
          if (live.current === connection && phase === "situation") {
            close();
            setSituationSummary(situation);
            setState("idle");
            onSituationComplete(situation);
          }
        },
      });
      live.current = connection;
      await (nextContext.kind === "situation"
        ? connection.startCustomSituation(nextContext.place)
        : connection.startCustomPlace());
    } catch {
      close();
      setState("idle");
      setError("Couldn't open your audio device. Please try again.");
    }
  }

  return {
    state,
    active: state !== "idle" && state !== "ended",
    placeSummary,
    situationSummary,
    error,
    caption,
    getAnalyser: () => live.current?.getAnalyser() ?? null,
    start,
    cancel,
    resetSituation() {
      cancel();
      setSituationSummary(null);
    },
  };
}
