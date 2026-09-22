import type { CustomPlaceSummary, PracticeLanguage } from "@chitchat/contracts";
import { useQuery } from "@tanstack/react-query";
import { Check, LoaderCircle, Pencil, Plus } from "lucide-react";
import { Checkbox, Collapsible } from "radix-ui";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { practiceScenePreviewQuery } from "@/lib/practice-api";

import { ConversationMode, useConversationMode } from "./conversation-mode";
import { PracticeConversation } from "./practice-conversation";
import type { usePractice } from "./use-practice";

type SceneChoice = CustomPlaceSummary & { id: string };

export function PracticeReady({
  practice,
  language,
  selectedPlace,
  selectedSituation,
  selectedPersona,
}: {
  language: PracticeLanguage;
  practice: ReturnType<typeof usePractice>;
  selectedPlace: SceneChoice;
  selectedSituation: SceneChoice;
  selectedPersona: { id: string; name: string; avatar?: string };
}) {
  const [mode, setMode] = useConversationMode();
  const [backstory, setBackstory] = useState("");
  const [draftBackstory, setDraftBackstory] = useState("");
  const [editingBackstory, setEditingBackstory] = useState(false);
  const [includeGoal, setIncludeGoal] = useState(true);
  const backstoryId = useId();
  const preview = useQuery({
    ...practiceScenePreviewQuery({
      place: {
        name: selectedPlace.name,
        description: selectedPlace.description,
      },
      situation: {
        name: selectedSituation.name,
        description: selectedSituation.description,
      },
      personaId: selectedPersona.id,
      ...(backstory && { backstory }),
    }),
    enabled: practice.state === "idle",
  });

  function renderPreview() {
    if (preview.isPending || preview.isFetching) {
      return (
        <div className="text-muted-foreground flex min-h-52 w-full flex-col items-center justify-center gap-3">
          <LoaderCircle
            aria-hidden="true"
            className="size-5 motion-safe:animate-spin"
          />
          <output className="text-base">Chit is setting the scene…</output>
        </div>
      );
    }
    if (preview.isError) {
      return (
        <div className="flex min-h-52 flex-col items-center justify-center gap-4">
          <p
            role="alert"
            className="text-muted-foreground text-base leading-relaxed"
          >
            {preview.error.message}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void preview.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      );
    }
    return (
      <>
        <h1 className="text-2xl leading-tight font-medium tracking-[-0.03em] text-balance sm:text-3xl">
          {preview.data.title}
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xs text-base leading-relaxed text-pretty">
          {preview.data.description}
        </p>
      </>
    );
  }

  return (
    <div className="relative flex w-full max-w-xl flex-col items-center gap-8">
      {practice.state === "idle" ? (
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          {renderPreview()}
          <Collapsible.Root
            open={editingBackstory}
            onOpenChange={(open) => {
              setDraftBackstory(backstory);
              setEditingBackstory(open);
            }}
            className="mt-4 w-full max-w-xs"
          >
            <Collapsible.Trigger asChild>
              <Button
                variant="ghost"
                className="text-muted-foreground gap-2 text-base"
              >
                {backstory ? (
                  <Pencil aria-hidden="true" className="size-3.5" />
                ) : (
                  <Plus aria-hidden="true" className="size-3.5" />
                )}
                {backstory ? "Edit backstory" : "Add backstory"}
              </Button>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <form
                className="mt-3 space-y-3 text-left"
                onSubmit={(event) => {
                  event.preventDefault();
                  setBackstory(draftBackstory.trim());
                  setEditingBackstory(false);
                }}
              >
                <label htmlFor={backstoryId} className="text-base font-medium">
                  Your backstory
                </label>
                <Textarea
                  id={backstoryId}
                  value={draftBackstory}
                  maxLength={1000}
                  rows={4}
                  placeholder="We’re teammates meeting for the first time. I’m new to the team and a little nervous."
                  onChange={(event) => setDraftBackstory(event.target.value)}
                  className="resize-y"
                />
                <p className="text-muted-foreground text-sm leading-relaxed">
                  How do you know each other? What brings you here?
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {backstory && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setBackstory("");
                        setDraftBackstory("");
                        setEditingBackstory(false);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingBackstory(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="secondary" size="sm">
                    Update scene
                  </Button>
                </div>
              </form>
            </Collapsible.Content>
          </Collapsible.Root>
          {preview.data && !preview.isFetching && !preview.isError && (
            <div className="mt-6 w-full max-w-xs">
              <p className="text-muted-foreground font-handwriting text-sm">
                a small goal · optional
              </p>
              <Checkbox.Root
                checked={includeGoal}
                onCheckedChange={(checked) => setIncludeGoal(checked === true)}
                className="focus-visible:ring-ring/50 mt-2 flex min-h-12 w-full items-start gap-3 rounded-lg p-2 text-left text-base leading-relaxed outline-none focus-visible:ring-2"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border ${includeGoal ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}
                >
                  <Checkbox.Indicator>
                    <Check className="size-3" strokeWidth={2.5} />
                  </Checkbox.Indicator>
                </span>
                <span>{preview.data.goal}</span>
              </Checkbox.Root>
            </div>
          )}
          <ConversationMode mode={mode} setMode={setMode} />
          <Button
            size="lg"
            className="mt-8 w-full max-w-xs rounded-full"
            disabled={
              !preview.data ||
              preview.isFetching ||
              preview.isError ||
              editingBackstory
            }
            onClick={() => {
              if (!preview.data) {
                return;
              }
              void practice.start({
                language,
                ...(mode === "guided" && { mode }),
                placeId: selectedPlace.id,
                settingId: selectedSituation.id,
                personaId: selectedPersona.id,
                ...(selectedPlace.id === "custom" && {
                  customPlace: selectedPlace.name,
                }),
                ...(selectedSituation.id === "custom" && {
                  customSetting: selectedSituation.name,
                }),
                scenePreview: {
                  title: preview.data.title,
                  description: preview.data.description,
                },
                ...(backstory && { backstory }),
                ...(includeGoal && { goal: preview.data.goal }),
              });
            }}
          >
            Talk with {selectedPersona.name}
          </Button>
        </div>
      ) : (
        <PracticeConversation
          practice={practice}
          name={selectedPersona.name}
          avatar={selectedPersona.avatar}
          scene={`${selectedPlace.name} · ${selectedSituation.name}`}
        />
      )}
      {practice.error && (
        <p role="alert" className="text-destructive text-center text-base">
          {practice.error}
        </p>
      )}
    </div>
  );
}
