import { practiceSelectionSchema } from "@chitchat/contracts";
import type {
  PracticeDraft,
  PracticeOptions,
  PracticeSelection,
} from "@chitchat/contracts";
import {
  ArrowRight,
  MapPin,
  Shuffle,
  Square,
  Target,
  Volume2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { ConversationMode, useConversationMode } from "./conversation-mode";
import { selectionLabel } from "./setup-choices";
import type { usePersonaPreview } from "./use-persona-preview";

export function SetupMission({
  options,
  selection,
  busy,
  preview,
  onStart,
  onShuffle,
}: {
  options: PracticeOptions;
  selection: PracticeDraft;
  busy: boolean;
  preview: ReturnType<typeof usePersonaPreview>;
  onStart: (selection: PracticeSelection) => void;
  onShuffle: () => void;
}) {
  const [mode, setMode] = useConversationMode();
  const persona = options.personas.find(({ id }) => id === selection.personaId);
  const situation = options.settings.find(
    ({ id }) => id === selection.settingId
  );
  const place = selectionLabel(options, "place", selection);
  return (
    <>
      <div className="setup-mission">
        <div className="setup-mission-icon">
          <Target aria-hidden="true" />
        </div>
        <p className="setup-eyebrow">YOUR MISSION</p>
        <h3>{selection.customSetting ?? situation?.name}</h3>
        <p className="setup-mission-location">
          <MapPin aria-hidden="true" />
          {place}
        </p>
        {situation && <p>{situation.description}</p>}
        <ol className="setup-objectives">
          {(
            situation?.objectives ?? [
              "Open the conversation with a hello",
              "Work toward the goal you chose",
              "Ask a follow-up question",
            ]
          ).map((objective, index) => (
            <li key={objective}>
              <span>{index + 1}</span>
              {objective}
            </li>
          ))}
        </ol>
        {persona && (
          <div className="setup-partner-preview">
            <img
              className="setup-avatar"
              src={persona.avatar}
              alt=""
              width={64}
              height={64}
            />
            <div>
              <strong>You’ll meet {persona.name}</strong>
              <p>{persona.tags.slice(0, 3).join(" · ")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-label={
                preview.status
                  ? "Stop introduction"
                  : `Hear ${persona.name}'s introduction`
              }
              onClick={() => {
                if (preview.status) {
                  preview.stop();
                } else {
                  void preview.play(persona);
                }
              }}
            >
              {preview.status ? (
                <Square aria-hidden="true" />
              ) : (
                <Volume2 aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {preview.status ? "Stop" : "Say hello"}
              </span>
            </Button>
          </div>
        )}
      </div>
      <ConversationMode mode={mode} setMode={setMode} />
      <div className="setup-start">
        <Button
          type="button"
          className="setup-start-button"
          disabled={
            busy ||
            !options.available ||
            !practiceSelectionSchema.safeParse(selection).success
          }
          onClick={() => {
            const parsed = practiceSelectionSchema.safeParse(selection);
            if (parsed.success) {
              preview.stop();
              onStart({ ...parsed.data, ...(mode === "guided" && { mode }) });
            }
          }}
        >
          Start talking
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => onShuffle()}
        >
          <Shuffle aria-hidden="true" />
          Shuffle again
        </Button>
      </div>
      <p className="setup-hint setup-centered">
        Your microphone turns on when you start. Mute or finish whenever you
        like.
      </p>
      {!options.available && (
        <output className="setup-error">
          Voice practice isn’t configured yet. You can explore your choices and
          come back later.
        </output>
      )}
    </>
  );
}
