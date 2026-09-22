import { useSyncExternalStore } from "react";

type Mode = "free" | "guided";
let memoryMode: Mode = "free";
const eventName = "chitchat-mode-change";
function getMode(): Mode {
  try {
    const saved = localStorage.getItem("chitchat-practice-mode");
    if (saved === "free" || saved === "guided") {
      return saved;
    }
  } catch {
    // Fall back to the preference for this page when storage is unavailable.
  }
  return memoryMode;
}
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(eventName, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(eventName, notify);
  };
}
function saveMode(mode: Mode) {
  memoryMode = mode;
  try {
    localStorage.setItem("chitchat-practice-mode", mode);
  } catch {
    // The current-page preference still works without storage.
  }
  window.dispatchEvent(new Event(eventName));
}
export function useConversationMode() {
  const mode = useSyncExternalStore(subscribe, getMode, (): Mode => "free");
  return [mode, saveMode] as const;
}

export function ConversationMode({
  mode,
  setMode,
}: {
  mode: "free" | "guided";
  setMode: (mode: "free" | "guided") => void;
}) {
  return (
    <fieldset className="mx-auto mt-8 w-full max-w-xs">
      <legend className="mb-2 text-center text-base font-medium">
        Conversation mode
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {(["free", "guided"] as const).map((value) => (
          <label
            key={value}
            className={`has-focus-visible:ring-ring flex min-h-13 cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-center text-base transition-colors has-focus-visible:ring-2 ${mode === value ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"}`}
          >
            <input
              type="radio"
              name="conversation-mode"
              value={value}
              checked={mode === value}
              className="sr-only"
              onChange={() => {
                setMode(value);
              }}
            />
            {value === "free" ? "Free talk" : "Guided"}
          </label>
        ))}
      </div>
      <p className="text-muted-foreground mt-3 min-h-10 text-center text-sm leading-relaxed">
        {mode === "guided"
          ? "Follow a prepared reply. Say it aloud to continue."
          : "Speak freely. Ask for a suggested reply whenever you need one."}
      </p>
    </fieldset>
  );
}
