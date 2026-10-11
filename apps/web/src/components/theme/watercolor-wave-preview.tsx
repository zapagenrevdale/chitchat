import { ChevronUp, MicOff } from "lucide-react";
import { useCallback, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WatercolorWave } from "@/components/ui/watercolor-wave";

type PreviewState = "quiet" | "speaking" | "muted";

export function WatercolorWavePreview() {
  const [state, setState] = useState<PreviewState>("speaking");
  const [level, setLevel] = useState(0.65);
  const getLevel = useCallback(() => {
    if (state !== "speaking") {
      return 0;
    }
    const time = performance.now() / 1000;
    const pulse = Math.abs(Math.sin(time * 2.4) * Math.cos(time * 1.1));
    return level * (0.12 + pulse * 0.88);
  }, [level, state]);

  return (
    <section
      id="watercolor-wave"
      aria-labelledby="watercolor-wave-title"
      className="mt-12 scroll-mt-24"
    >
      <h3
        id="watercolor-wave-title"
        className="text-muted-foreground text-sm font-medium"
      >
        Watercolor · listening with you
      </h3>
      <div className="bg-background relative mt-5 h-80 overflow-hidden rounded-2xl border sm:h-96">
        <WatercolorWave active={state !== "muted"} getLevel={getLevel} />
        <output className="text-primary absolute inset-x-0 bottom-12 flex flex-col items-center gap-3 text-lg font-medium">
          {state === "muted" ? (
            <MicOff aria-hidden="true" className="size-6" />
          ) : (
            <ChevronUp aria-hidden="true" className="size-7" />
          )}
          <span>{state === "muted" ? "Microphone off" : "I’m listening"}</span>
        </output>
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3">
          <ToggleGroup
            type="single"
            value={state}
            onValueChange={(value) => {
              if (
                value === "quiet" ||
                value === "speaking" ||
                value === "muted"
              ) {
                setState(value);
              }
            }}
            size="sm"
            aria-label="Watercolor preview state"
          >
            <ToggleGroupItem value="quiet">Quiet</ToggleGroupItem>
            <ToggleGroupItem value="speaking">Speaking</ToggleGroupItem>
            <ToggleGroupItem value="muted">Muted</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            Switch from Speaking to Quiet to watch the paint settle. This
            preview uses simulated speech.
          </p>
        </div>
        <label className="text-muted-foreground flex w-full max-w-64 flex-col gap-2 text-sm">
          Simulated loudness · {Math.round(level * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={level}
            disabled={state !== "speaking"}
            onChange={(event) => setLevel(Number(event.target.value))}
            className="accent-primary min-h-11 w-full"
          />
        </label>
      </div>
    </section>
  );
}
