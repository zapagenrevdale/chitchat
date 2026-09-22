import type { PracticeOptions } from "@chitchat/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

interface Clip {
  audio: HTMLAudioElement;
  controller: AbortController;
}

function release(clip: Clip | null) {
  if (!clip) {
    return;
  }
  const { audio, controller } = clip;
  controller.abort();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

export function usePersonaPreview() {
  const current = useRef<Clip | null>(null);
  const [status, setStatus] = useState<"loading" | "playing" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    const previous = current.current;
    current.current = null;
    release(previous);
    setStatus(null);
  }, []);

  useEffect(
    () => () => {
      const previous = current.current;
      current.current = null;
      release(previous);
    },
    []
  );

  async function play(persona: PracticeOptions["personas"][number]) {
    stop();
    setError(null);
    const audio = new Audio(persona.introductionAudio);
    const controller = new AbortController();
    current.current = { audio, controller };
    setStatus("loading");
    const failed = () => {
      if (current.current?.audio !== audio) {
        return;
      }
      stop();
      setError(`Couldn't play ${persona.name}'s introduction. Try again.`);
    };
    audio.addEventListener("error", failed, { signal: controller.signal });
    audio.addEventListener(
      "ended",
      () => {
        if (current.current?.audio === audio) {
          stop();
        }
      },
      { signal: controller.signal }
    );
    try {
      await audio.play();
      if (current.current?.audio === audio) {
        setStatus("playing");
      }
    } catch {
      failed();
    }
  }

  return { play, stop, status, error };
}
