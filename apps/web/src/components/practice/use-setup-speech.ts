import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createTranscriptionSession } from "@/lib/practice-api";
import { PracticeAudio } from "@/lib/practice-audio";
import { PracticeTranscription } from "@/lib/practice-transcription";

export const defaultSpeechErrors = {
  unsupported: "Voice input isn't supported here. Type your answer instead.",
  denied:
    "Microphone access was denied. Allow it in your browser, or type your answer.",
  service: "Speech transcription is unavailable. Type your answer instead.",
  microphone: "No microphone was found. Connect one, or type your answer.",
  noSpeech: "I didn't catch that. Try speaking again, or type your answer.",
  network: "Voice input couldn't connect. Try again, or type your answer.",
  stopped: "Voice input stopped. Try again, or type your answer.",
  start: "Couldn't start voice input. Try again, or type your answer.",
};

interface SetupSpeechOptions {
  autoStart?: boolean;
  errorMessages?: typeof defaultSpeechErrors;
  silenceTimeoutMs?: number;
  onComplete?: () => void;
}
interface ActiveSpeech {
  controller: AbortController;
  audio: PracticeAudio;
  transcription: PracticeTranscription;
  segments: Map<string, string>;
  prefix: string;
  transcript: string;
  capturing: boolean;
  stopping: boolean;
  silenceDeadline?: number;
  timer?: ReturnType<typeof setInterval>;
  activitySince?: number;
}
function subscribe() {
  return () => {
    // Browser audio support is fixed for this page.
  };
}
function speechSupported() {
  return Boolean(
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof AudioContext !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof WebSocket !== "undefined"
  );
}
function serverSpeechSupported() {
  return false;
}
function release(session: ActiveSpeech | null) {
  if (!session) {
    return;
  }
  clearInterval(session.timer);
  session.controller.abort();
  session.transcription.close();
  session.audio.dispose();
}

export function useSetupSpeech(
  onTranscript: (text: string) => void,
  options: SetupSpeechOptions = {}
) {
  const messages = options.errorMessages ?? defaultSpeechErrors;
  const supported = useSyncExternalStore(
    subscribe,
    speechSupported,
    serverSpeechSupported
  );
  const [starting, setStarting] = useState(Boolean(options.autoStart));
  const [listening, setListening] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const active = useRef<ActiveSpeech | null>(null);
  const paused = useRef("");
  const callbacks = useRef({ onTranscript, onComplete: options.onComplete });
  useEffect(() => {
    callbacks.current = { onTranscript, onComplete: options.onComplete };
  }, [onTranscript, options.onComplete]);
  const cancel = useCallback(() => {
    paused.current = "";
    const session = active.current;
    active.current = null;
    release(session);
    setStarting(false);
    setListening(false);
    setStopping(false);
    setSpeechError(null);
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", cancel);
    return () => {
      window.removeEventListener("pagehide", cancel);
      const session = active.current;
      active.current = null;
      release(session);
    };
  }, [cancel]);

  function pause() {
    const text = active.current?.transcript ?? "";
    cancel();
    paused.current = text;
  }
  function fail(session: ActiveSpeech, message: string) {
    if (active.current !== session) {
      return;
    }
    cancel();
    setSpeechError(message);
  }
  async function finish(session: ActiveSpeech) {
    await session.transcription.finish();
    if (active.current !== session) {
      return;
    }
    const text = session.transcript.trim();
    active.current = null;
    release(session);
    setStopping(false);
    if (text) {
      callbacks.current.onComplete?.();
    } else {
      setSpeechError(messages.noSpeech);
    }
  }
  function stop() {
    const session = active.current;
    if (!session || session.stopping) {
      return;
    }
    if (!session.capturing) {
      cancel();
      return;
    }
    session.stopping = true;
    session.capturing = false;
    session.silenceDeadline = undefined;
    clearInterval(session.timer);
    session.audio.stopInput();
    setListening(false);
    setStopping(true);
    void finish(session);
  }
  function start() {
    if (active.current) {
      return;
    }
    setSpeechError(null);
    if (!speechSupported()) {
      setStarting(false);
      setSpeechError(messages.unsupported);
      return;
    }
    let audio: PracticeAudio;
    try {
      audio = new PracticeAudio(() => {
        /* Capture has no speaker playback. */
      });
    } catch {
      setStarting(false);
      setSpeechError(messages.start);
      return;
    }
    const controller = new AbortController();
    const prefix = paused.current;
    paused.current = "";
    const session: ActiveSpeech = {
      controller,
      audio,
      prefix,
      transcript: prefix,
      segments: new Map(),
      capturing: false,
      stopping: false,
      transcription: new PracticeTranscription({
        onTurn: () => {
          /* Segment IDs are assembled in onText. */
        },
        onText: (id, text) => {
          if (active.current !== session) {
            return;
          }
          session.segments.set(id, text);
          const transcript = [session.prefix, ...session.segments.values()]
            .filter(Boolean)
            .join(" ")
            .slice(0, 500);
          if (
            transcript !== session.transcript &&
            transcript &&
            !session.stopping &&
            options.silenceTimeoutMs
          ) {
            session.silenceDeadline = Date.now() + options.silenceTimeoutMs;
          }
          session.transcript = transcript;
          callbacks.current.onTranscript(transcript);
        },
        onFailure: () => fail(session, messages.network),
      }),
    };
    active.current = session;
    setStarting(true);
    const begin = async () => {
      try {
        // Prepare capture from the initiating gesture; send only after Gemini is ready.
        await Promise.all([
          audio.prepare(
            controller.signal,
            (data, rate) => {
              if (active.current === session && session.capturing) {
                session.transcription.sendAudio(data, rate);
              }
            },
            () => fail(session, messages.stopped)
          ),
          (async () => {
            const { token } = await createTranscriptionSession(
              controller.signal
            );
            controller.signal.throwIfAborted();
            await session.transcription.start(token, controller.signal);
          })(),
        ]);
        if (active.current !== session) {
          return;
        }
        session.capturing = true;
        setStarting(false);
        setListening(true);
        const timeout = options.silenceTimeoutMs;
        if (timeout) {
          if (prefix) {
            session.silenceDeadline = Date.now() + timeout;
          }
          session.timer = setInterval(() => {
            const now = Date.now();
            // Sustained microphone activity protects speech while captions catch up.
            if (audio.inputVolume >= 0.04) {
              if (session.activitySince === undefined) {
                session.activitySince = now;
              }
              if (session.transcript && now - session.activitySince >= 1000) {
                session.silenceDeadline = now + timeout;
              }
            } else {
              session.activitySince = undefined;
            }
            if (
              session.silenceDeadline !== undefined &&
              now >= session.silenceDeadline
            ) {
              stop();
            }
          }, 50);
        }
      } catch (error) {
        let message = messages.network;
        if (error instanceof DOMException) {
          if (error.name === "NotAllowedError") {
            message = messages.denied;
          }
          if (error.name === "NotFoundError") {
            message = messages.microphone;
          }
        }
        fail(session, message);
      }
    };
    void begin();
  }
  const startAutomatically = useEffectEvent(start);
  useEffect(() => {
    if (options.autoStart) {
      // oxlint-disable-next-line react/set-state-in-effect
      startAutomatically();
    }
  }, [options.autoStart]);
  return {
    supported,
    starting,
    listening,
    stopping,
    error: speechError,
    start,
    stop,
    pause,
    cancel,
    getInputVolume: () =>
      active.current?.capturing ? active.current.audio.inputVolume : 0,
    getSilenceRemaining: () =>
      Math.max(0, (active.current?.silenceDeadline ?? 0) - Date.now()),
  };
}
