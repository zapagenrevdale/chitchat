import { ArrowUp, Mic, Square } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { useSetupSpeech } from "./use-setup-speech";

function voiceHint(listening: boolean, supported: boolean) {
  if (listening) {
    return "Listening… Your words will appear here. You can edit them before continuing.";
  }
  if (supported) {
    return "Say as much as you like. We'll fill in the choices you mention. Speech uses your browser's recognition service.";
  }
  return "Type your answer to fill in several choices at once. Voice input isn't available in this browser.";
}

export function SetupAnswer({
  busy,
  onAnswer,
  previewing = false,
  onVoiceStart,
}: {
  busy: boolean;
  onAnswer: (text: string) => void;
  previewing?: boolean;
  onVoiceStart?: () => void;
}) {
  const [text, setText] = useState("");
  const speech = useSetupSpeech(setText);
  const { cancel } = speech;
  useEffect(() => {
    if (busy || previewing) {
      cancel();
    }
  }, [busy, previewing, cancel]);

  return (
    <form
      className="setup-answer"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() && !busy && !speech.listening) {
          onAnswer(text.trim());
        }
      }}
    >
      <label htmlFor="setup-answer">Or make it your own</label>
      <div className="setup-answer-box" data-listening={speech.listening}>
        <textarea
          id="setup-answer"
          value={text}
          maxLength={500}
          rows={2}
          disabled={busy || speech.listening}
          onChange={(event) => setText(event.target.value)}
          placeholder="“Order coffee at a café, with easy questions”"
          aria-describedby="setup-voice-hint"
        />
        <div className="setup-answer-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={!speech.supported || busy}
            onClick={() => {
              if (speech.listening) {
                speech.stop();
              } else {
                onVoiceStart?.();
                speech.start();
              }
            }}
            aria-pressed={speech.listening}
          >
            {speech.listening ? (
              <Square aria-hidden="true" />
            ) : (
              <Mic aria-hidden="true" />
            )}
            {speech.listening ? "Finish speaking" : "Tell us your choice"}
          </Button>
          <Button
            type="submit"
            disabled={!text.trim() || busy || speech.listening}
          >
            {busy ? "Reading answer…" : "Use answer"}
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
      </div>
      <output id="setup-voice-hint" className="setup-hint">
        {voiceHint(speech.listening, speech.supported)}
      </output>
      {speech.error && (
        <p className="setup-error" role="alert">
          {speech.error}
        </p>
      )}
    </form>
  );
}
