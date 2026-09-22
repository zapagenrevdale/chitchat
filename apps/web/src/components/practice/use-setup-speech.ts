import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type RecognitionResult = Record<number, { transcript: string }>;
interface RecognitionEvents {
  result: { results: { length: number; [index: number]: RecognitionResult } };
  error: { error: string };
  end: Event;
}
export interface SetupSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  addEventListener: <K extends keyof RecognitionEvents>(
    type: K,
    listener: (event: RecognitionEvents[K]) => void,
    options?: AddEventListenerOptions
  ) => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SetupSpeechRecognition;
  webkitSpeechRecognition?: new () => SetupSpeechRecognition;
};
interface ActiveSpeech {
  recognition: SetupSpeechRecognition;
  controller: AbortController;
}

function recognitionConstructor() {
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
function subscribe() {
  return () => {
    /* Browser speech support is fixed for this page. */
  };
}
function speechSupported() {
  return Boolean(recognitionConstructor());
}
function serverSpeechSupported() {
  return false;
}
function release(active: ActiveSpeech | null) {
  if (active) {
    active.controller.abort();
    active.recognition.abort();
  }
}

export function useSetupSpeech(onTranscript: (text: string) => void) {
  const supported = useSyncExternalStore(
    subscribe,
    speechSupported,
    serverSpeechSupported
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<ActiveSpeech | null>(null);
  const cancel = useCallback(() => {
    const previous = active.current;
    active.current = null;
    release(previous);
    setListening(false);
    setError(null);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", cancel);
    return () => {
      window.removeEventListener("pagehide", cancel);
      const previous = active.current;
      active.current = null;
      release(previous);
    };
  }, [cancel]);

  function start() {
    cancel();
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setError("Voice input isn't supported here. Type your answer instead.");
      return;
    }
    try {
      const recognition = new Recognition();
      const controller = new AbortController();
      active.current = { recognition, controller };
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      let heard = false;
      recognition.addEventListener(
        "result",
        (event) => {
          if (active.current?.recognition !== recognition) {
            return;
          }
          const text = Array.from(
            { length: event.results.length },
            (_, index) => event.results[index]?.[0]?.transcript ?? ""
          )
            .join(" ")
            .trim();
          heard = Boolean(text);
          onTranscript(text.slice(0, 500));
        },
        { signal: controller.signal }
      );
      recognition.addEventListener(
        "error",
        (event) => {
          if (active.current?.recognition !== recognition) {
            return;
          }
          const messages: Record<string, string> = {
            "not-allowed":
              "Microphone access was denied. Allow it in your browser, or type your answer.",
            "service-not-allowed":
              "Your browser's speech service is unavailable. Type your answer instead.",
            "audio-capture":
              "No microphone was found. Connect one, or type your answer.",
            "no-speech":
              "I didn't catch that. Try speaking again, or type your answer.",
            network:
              "Voice input couldn't connect. Try again, or type your answer.",
          };
          const message =
            messages[event.error] ??
            "Voice input stopped. Try again, or type your answer.";
          cancel();
          setError(message);
        },
        { signal: controller.signal }
      );
      recognition.addEventListener(
        "end",
        () => {
          if (active.current?.recognition !== recognition) {
            return;
          }
          active.current = null;
          controller.abort();
          setListening(false);
          if (!heard) {
            setError(
              "I didn't catch that. Try speaking again, or type your answer."
            );
          }
        },
        { signal: controller.signal }
      );
      recognition.start();
      setListening(true);
    } catch {
      cancel();
      setError("Couldn't start voice input. Try again, or type your answer.");
    }
  }
  return {
    supported,
    listening,
    error,
    start,
    stop: () => active.current?.recognition.stop(),
    cancel,
  };
}
