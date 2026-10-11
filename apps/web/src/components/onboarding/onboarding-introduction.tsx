import type { PracticeLanguage } from "@chitchat/contracts";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import { ChitAvatar } from "@/components/ui/chit-avatar";
import { useOnboardingLocale } from "@/lib/onboarding-locale";
import { m } from "@/paraglide/messages";

import introductions from "../../../public/audio/chit/manifest.json";
import welcomes from "../../../public/audio/chit/welcome/manifest.json";

export function getWelcome(language: PracticeLanguage) {
  return welcomes.find((sample) => sample.language === language);
}

export function getIntroduction(language: PracticeLanguage) {
  return (
    introductions.find((sample) => sample.language === language) ??
    introductions[0]
  );
}

async function closeIntroductionContext(context: AudioContext) {
  try {
    await context.close();
  } catch {
    // Playback has already stopped; the context may already be closed.
  }
}

export function useOnboardingIntroduction() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const frame = useRef(0);
  const listeners = useRef<AbortController | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [revealedWords, setRevealedWords] = useState(0);
  const dispose = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const { current } = audio;
    audio.current = null;
    if (current) {
      listeners.current?.abort();
      current.pause();
    }
    analyser.current = null;
    const previousContext = context.current;
    context.current = null;
    if (previousContext) {
      void closeIntroductionContext(previousContext);
    }
  }, []);
  const getAnalyser = useCallback(() => analyser.current, []);
  useEffect(() => dispose, [dispose]);

  async function connectAnalyser(current: HTMLAudioElement) {
    try {
      const playbackContext = new AudioContext();
      context.current = playbackContext;
      await playbackContext.resume();
      if (audio.current !== current) {
        return;
      }
      const meter = playbackContext.createAnalyser();
      meter.fftSize = 256;
      meter.connect(playbackContext.destination);
      playbackContext.createMediaElementSource(current).connect(meter);
      analyser.current = meter;
    } catch {
      // The greeting can still play when Web Audio is unavailable.
    }
  }

  const stop = useCallback(() => {
    dispose();
    setSpeaking(false);
  }, [dispose]);
  useEffect(() => {
    function suspend() {
      if (document.hidden) {
        stop();
      }
    }
    document.addEventListener("visibilitychange", suspend);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", suspend);
      window.removeEventListener("pagehide", stop);
    };
  }, [stop]);
  async function playClip(introduction: {
    file: string;
    generatedAt: string;
    words?: { start: number }[];
  }) {
    dispose();
    setUnavailable(false);
    setSpeaking(true);
    setRevealedWords(0);
    const current = new Audio(
      `${introduction.file}?v=${encodeURIComponent(introduction.generatedAt)}`
    );
    audio.current = current;
    void connectAnalyser(current);
    function finish(failed: boolean) {
      if (audio.current !== current) {
        return;
      }
      dispose();
      setSpeaking(false);
      setUnavailable(failed);
    }
    listeners.current = new AbortController();
    const { signal } = listeners.current;
    current.addEventListener("ended", () => finish(false), { signal });
    current.addEventListener("error", () => finish(true), { signal });
    let visibleWords = 0;
    function updateWords() {
      if (audio.current !== current) {
        return;
      }
      const next = (introduction.words ?? []).filter(
        (word) => word.start <= current.currentTime
      ).length;
      if (next !== visibleWords) {
        visibleWords = next;
        setRevealedWords(next);
      }
    }
    function tick() {
      if (audio.current !== current) {
        return;
      }
      updateWords();
      frame.current = requestAnimationFrame(tick);
    }
    current.addEventListener("timeupdate", updateWords, { signal });
    frame.current = requestAnimationFrame(tick);
    try {
      // Called directly from Continue to preserve the browser's user activation.
      await current.play();
    } catch {
      finish(true);
    }
  }
  function play(language: PracticeLanguage) {
    return playClip(getIntroduction(language));
  }
  function playWelcome(language: PracticeLanguage) {
    const clip = getWelcome(language);
    if (clip) {
      return playClip(clip);
    }
    stop();
    setUnavailable(true);
  }
  return {
    speaking,
    unavailable,
    revealedWords,
    play,
    playWelcome,
    stop,
    getAnalyser,
  };
}

function IntroductionWords({
  words,
  speaking,
  revealedWords,
}: {
  words: { text: string; start: number }[];
  speaking: boolean;
  revealedWords: number;
}) {
  const reducedMotion = useReducedMotion();
  return words.map((word, index) => (
    <span
      key={`${word.start}-${word.text}`}
      aria-hidden="true"
      className="onboarding-introduction-phrase"
      style={{
        opacity: !speaking || reducedMotion || index < revealedWords ? 1 : 0,
      }}
    >
      {word.text}
    </span>
  ));
}

export function OnboardingWelcome({
  speaking,
  revealedWords,
  headingRef,
}: {
  speaking: boolean;
  revealedWords: number;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const locale = useOnboardingLocale();
  const welcome = welcomes.find((sample) => sample.code === locale);
  const greeting = m.welcome_greeting({}, { locale });
  const text = welcome?.text ?? `${greeting} ${m.welcome_body({}, { locale })}`;
  const words = welcome?.words ?? [{ text, start: 0 }];
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      aria-label={words.map((word) => word.text).join("")}
      className="onboarding-introduction mx-auto max-w-xl text-xl leading-relaxed font-normal text-pretty outline-none"
    >
      <IntroductionWords
        words={words}
        speaking={speaking}
        revealedWords={revealedWords}
      />
    </h1>
  );
}

export function OnboardingName({
  language,
  name,
  speaking,
  revealedWords,
  unavailable,
  getAnalyser,
  headingRef,
  onChange,
  onSubmit,
}: {
  language: PracticeLanguage;
  name: string;
  speaking: boolean;
  revealedWords: number;
  unavailable: boolean;
  getAnalyser: () => AnalyserNode | null;
  headingRef: Ref<HTMLHeadingElement>;
  onChange: (name: string) => void;
  onSubmit: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const locale = useOnboardingLocale();
  const introduction = getIntroduction(language);
  const phrases = introduction.words;
  return (
    <>
      <div className="absolute inset-x-0 top-7 text-center sm:top-10">
        <ChitAvatar
          size={56}
          state={speaking ? "speaking" : "idle"}
          getAnalyser={getAnalyser}
        />
      </div>
      <section className="mx-auto w-full max-w-xl pt-16">
        <h1
          key={introduction.code}
          ref={headingRef}
          tabIndex={-1}
          lang={introduction.code}
          dir="auto"
          aria-label={introduction.text}
          className="onboarding-introduction text-3xl leading-tight font-medium tracking-[-0.035em] text-pretty outline-none sm:text-4xl"
        >
          <IntroductionWords
            words={phrases}
            speaking={speaking}
            revealedWords={revealedWords}
          />
        </h1>
        {unavailable && (
          <output className="text-muted-foreground mt-4 block text-sm">
            {m.name_audio_error({}, { locale })}
          </output>
        )}
        <div className="mt-6 min-h-32">
          {!speaking && (
            <motion.form
              id="onboarding-name-form"
              initial={{
                opacity: 0,
                transform: reducedMotion ? "none" : "translateY(12px)",
              }}
              animate={{
                opacity: 1,
                transform: reducedMotion ? "none" : "translateY(0px)",
              }}
              transition={{
                duration: reducedMotion ? 0 : 0.24,
                ease: [0.23, 1, 0.32, 1],
              }}
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) {
                  onSubmit();
                }
              }}
            >
              <label htmlFor="onboarding-name" className="sr-only">
                {m.name_label({}, { locale })}
              </label>
              <input
                ref={(node) => {
                  node?.focus({ preventScroll: true });
                }}
                id="onboarding-name"
                name="given-name"
                aria-describedby="onboarding-name-hint"
                autoComplete="name"
                dir="auto"
                value={name}
                maxLength={60}
                required
                onChange={(event) => onChange(event.target.value)}
                className="border-input placeholder:text-muted-foreground focus-visible:border-primary min-h-16 w-full border-b-2 bg-transparent px-0 text-center text-2xl transition-colors outline-none"
                placeholder={m.name_label({}, { locale })}
              />
              <p
                id="onboarding-name-hint"
                className="text-muted-foreground mt-3 text-center text-sm"
              >
                {m.name_hint({}, { locale })}
              </p>
            </motion.form>
          )}
        </div>
      </section>
    </>
  );
}

export function OnboardingNameContinue({
  name,
  speaking,
}: {
  name: string;
  speaking: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const locale = useOnboardingLocale();
  if (speaking || !name.trim()) {
    return null;
  }
  return (
    <motion.div
      className="ms-auto flex-1"
      initial={{
        opacity: 0,
        transform: reducedMotion ? "none" : "translateY(8px)",
      }}
      animate={{
        opacity: 1,
        transform: reducedMotion ? "none" : "translateY(0px)",
      }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
    >
      <Button
        className="onboarding-action w-full rounded-full"
        type="submit"
        form="onboarding-name-form"
      >
        {m.continue_button({}, { locale })}
      </Button>
    </motion.div>
  );
}
