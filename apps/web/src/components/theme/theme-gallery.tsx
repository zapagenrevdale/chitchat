import { presetPlaces } from "@chitchat/contracts";
import type { PracticeLanguage } from "@chitchat/contracts";
import type { ConversationSkill } from "@chitchat/contracts/conversation-goals";
import { onboardingBenefitIds } from "@chitchat/contracts/onboarding";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Plus,
  Shuffle,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { RadioGroup } from "radix-ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { ConversationMessage } from "@/components/chat/conversation-message";
import { OnboardingBenefits } from "@/components/onboarding/onboarding-benefits";
import { OnboardingSkills } from "@/components/onboarding/onboarding-choices";
import { ConversationMode } from "@/components/practice/conversation-mode";
import { PersonaAvatar } from "@/components/practice/persona-avatar";
import { PlaceImage } from "@/components/practice/place-image";
import { PracticeChoiceNavigation } from "@/components/practice/practice-choice-navigation";
import { PracticeLanguagePicker } from "@/components/practice/practice-language";
import { SelectChoiceButton } from "@/components/practice/select-choice-button";
import { TalkButton } from "@/components/practice/talk-button";
import { Badge } from "@/components/reui/badge";
import { ChatInputPreview } from "@/components/theme/chat-input-preview";
import { WatercolorWavePreview } from "@/components/theme/watercolor-wave-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChitAvatar } from "@/components/ui/chit-avatar";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const sections = [
  "Foundations",
  "Buttons",
  "Cards",
  "Skills",
  "Selection",
  "Avatars",
  "Voice",
  "Forms",
  "Chat",
  "Feedback",
];
const personas = ["alex", "jamie", "dani", "felix", "vera", "lily"];
const buttonVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;
const colors = [
  "background",
  "card",
  "foreground",
  "primary",
  "secondary",
  "muted",
  "muted-foreground",
  "border",
  "destructive",
  "success",
  "info",
  "warning",
];
const icons = {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Check,
  Plus,
  X,
  Shuffle,
  Sparkles,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={title.toLowerCase()}
      aria-labelledby={`${title.toLowerCase()}-title`}
      className="scroll-mt-24 border-t py-12 sm:py-16"
    >
      <div className="mb-8">
        <h2
          id={`${title.toLowerCase()}-title`}
          className="text-xl font-medium tracking-tight"
        >
          {title}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-xl text-base leading-relaxed">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h3 className="text-muted-foreground text-sm font-medium">{label}</h3>
      {children}
    </div>
  );
}

function SelectionPreview() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const place = presetPlaces[index];
  return (
    <div className="grid gap-12 md:grid-cols-2">
      <Sample label="Place picker · browse and select">
        <div className="flex flex-col items-center rounded-2xl border px-5 py-10">
          <PlaceImage place={place} imageSrc={place.imageSrc} />
          <div className="mt-8 w-full max-w-sm">
            <PracticeChoiceNavigation
              kind="place"
              name={place.name}
              choices={presetPlaces}
              transition={{ duration: 0 }}
              onBrowse={(direction) =>
                setIndex(
                  (index + direction + presetPlaces.length) %
                    presetPlaces.length
                )
              }
            />
          </div>
          <p className="text-muted-foreground mt-4 min-h-16 max-w-xs text-center text-base leading-relaxed">
            {place.description}
          </p>
          <SelectChoiceButton
            className="mt-6"
            onClick={() => setSelected(place.name)}
          >
            Select place
          </SelectChoiceButton>
          <output
            className="text-muted-foreground mt-4 min-h-5 text-center text-sm"
            aria-live="polite"
          >
            {selected
              ? `Selected ${selected}`
              : "Try the chevrons or arrow keys."}
          </output>
        </div>
      </Sample>
      <Sample label="Image collection · press to enlarge">
        <div className="grid gap-6 sm:grid-cols-2">
          {presetPlaces.slice(1, 5).map((item) => (
            <figure key={item.id}>
              <PlaceImage place={item} imageSrc={item.imageSrc} />
              <figcaption className="text-muted-foreground mt-3 text-sm capitalize">
                {item.name}
              </figcaption>
            </figure>
          ))}
        </div>
      </Sample>
    </div>
  );
}

function AvatarPreview() {
  const [persona, setPersona] = useState("alex");
  return (
    <RadioGroup.Root
      aria-label="Preview persona"
      value={persona}
      onValueChange={setPersona}
      className="grid grid-cols-3 gap-8 sm:grid-cols-6"
    >
      {personas.map((name) => (
        <RadioGroup.Item
          key={name}
          value={name}
          className="focus-visible:ring-ring flex flex-col items-center gap-4 rounded-xl py-4 outline-none focus-visible:ring-2"
        >
          <PersonaAvatar
            src={`/images/personas/${name}.svg`}
            selected={name === persona}
          />
          <span className="text-base font-medium capitalize">{name}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

function SkillsPreview() {
  const [skills, setSkills] = useState<ConversationSkill[]>([]);
  return (
    <OnboardingSkills
      value={skills}
      suggested={["start-conversations", "listening", "end-conversations"]}
      onChange={setSkills}
    />
  );
}

function VoicePreview() {
  const [state, setState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [playing, setPlaying] = useState(false);
  const [previewLevel, setPreviewLevel] = useState(0.5);
  const reducedMotion = useReducedMotion();
  return (
    <div className="grid gap-12 lg:grid-cols-3">
      <Sample label="Talk button · 56 px">
        <div className="flex min-h-48 flex-col items-center justify-center gap-5 rounded-2xl border">
          <TalkButton
            aria-label="Toggle talk preview"
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          />
          <output className="text-muted-foreground text-sm" aria-live="polite">
            {playing ? "Listening · preview only" : "Press to talk"}
          </output>
          <LiveWaveform
            active={false}
            processing={playing && !reducedMotion}
            height={32}
            className="w-40"
            aria-label="Preview waveform"
          />
        </div>
      </Sample>
      <Sample label="Chit · voice states">
        <div className="flex min-h-48 flex-col items-center justify-center gap-5 rounded-2xl border py-6">
          <ChitAvatar
            size={88}
            state={state}
            label={`Chit ${state}`}
            previewLevel={previewLevel}
          />
          <ToggleGroup
            type="single"
            value={state}
            onValueChange={(value) => {
              if (
                value === "idle" ||
                value === "listening" ||
                value === "thinking" ||
                value === "speaking"
              ) {
                setState(value);
              }
            }}
            size="sm"
            aria-label="Chit animation state"
            className="grid grid-cols-2"
          >
            <ToggleGroupItem value="idle">Idle</ToggleGroupItem>
            <ToggleGroupItem value="listening">Listening</ToggleGroupItem>
            <ToggleGroupItem value="thinking">Thinking</ToggleGroupItem>
            <ToggleGroupItem value="speaking">Speaking</ToggleGroupItem>
          </ToggleGroup>
          <label className="text-muted-foreground flex w-full max-w-48 flex-col gap-2 text-sm">
            Simulated audio level · {Math.round(previewLevel * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={previewLevel}
              disabled={state !== "speaking" && state !== "listening"}
              onChange={(event) => setPreviewLevel(Number(event.target.value))}
              className="accent-primary min-h-11 w-full"
            />
            <span>Live conversations use actual audio loudness.</span>
          </label>
        </div>
      </Sample>
      <Sample label="Waveform · resting / processing">
        <div className="flex min-h-48 flex-col justify-center gap-6 rounded-2xl border px-6">
          <LiveWaveform
            active={false}
            height={48}
            aria-label="Resting waveform"
          />
          <LiveWaveform
            active={false}
            processing={!reducedMotion}
            height={48}
            aria-label="Processing waveform"
          />
        </div>
      </Sample>
    </div>
  );
}

function FormPreview() {
  const [language, setLanguage] = useState<PracticeLanguage>("English");
  const [mode, setMode] = useState<"free" | "guided">("free");
  return (
    <div className="grid gap-12 md:grid-cols-2">
      <Sample label="Preferences">
        <div className="rounded-2xl border p-6">
          <PracticeLanguagePicker value={language} onChange={setLanguage} />
          <ConversationMode mode={mode} setMode={setMode} />
        </div>
      </Sample>
      <Sample label="Text fields">
        <div className="space-y-6">
          <Field>
            <FieldLabel htmlFor="theme-backstory">Your backstory</FieldLabel>
            <Textarea
              id="theme-backstory"
              aria-describedby="theme-backstory-help"
              placeholder="We’re teammates meeting for the first time…"
              rows={3}
            />
            <FieldDescription id="theme-backstory-help">
              How do you know each other? What brings you here?
            </FieldDescription>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="theme-invalid">Error state</FieldLabel>
            <Textarea
              id="theme-invalid"
              aria-invalid
              aria-describedby="theme-error"
              defaultValue=""
              placeholder="Add a little more detail"
            />
            <FieldError id="theme-error">
              Describe your scene before continuing.
            </FieldError>
          </Field>
          <Textarea
            disabled
            aria-label="Disabled text field"
            placeholder="Disabled field"
          />
        </div>
      </Sample>
    </div>
  );
}

export function ThemeGallery() {
  const [dark, setDark] = useState(false);
  const [lastAction, setLastAction] = useState("Try any enabled button.");
  useEffect(() => {
    const root = document.documentElement;
    const previousDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    return () => {
      root.classList.toggle("dark", previousDark);
      root.style.colorScheme = previousColorScheme;
    };
  }, [dark]);

  return (
    <div>
      <main
        id="main"
        className="bg-background text-foreground min-h-screen transition-colors"
      >
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-wrap items-start justify-between gap-6 pt-14 pb-10 sm:pt-20">
            <div>
              <p className="text-muted-foreground mb-4 text-sm font-medium tracking-widest uppercase">
                Chitchat / Design library
              </p>
              <ChitAvatar size={64} label="Chitchat icon" className="mb-4" />
              <h1 className="text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
                The little things, together.
              </h1>
              <p className="text-muted-foreground mt-5 max-w-lg text-base leading-relaxed">
                Our colors, controls, and conversation pieces. A living picture
                of how Chitchat looks and feels.
              </p>
              <p className="font-handwriting text-muted-foreground mt-4 text-base">
                pick something. press things. see how it feels.
              </p>
            </div>
            <Button
              variant="outline"
              aria-pressed={dark}
              onClick={() => setDark(!dark)}
            >
              {dark ? "Light appearance" : "Dark appearance"}
            </Button>
          </div>
          <nav
            aria-label="Design library sections"
            className="bg-background/95 sticky top-0 z-10 -mx-2 flex gap-1 overflow-x-auto px-2 py-4 backdrop-blur"
          >
            {sections.map((section) => (
              <Button key={section} asChild variant="ghost" size="sm">
                <a href={`#${section.toLowerCase()}`}>{section}</a>
              </Button>
            ))}
          </nav>
          <Section
            title="Foundations"
            description="The shared palette and type styles behind the studio."
          >
            <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-6">
              {colors.map((color) => (
                <div key={color}>
                  <div
                    className="mb-3 h-16 rounded-xl border"
                    style={{ backgroundColor: `var(--${color})` }}
                  />
                  <p className="text-muted-foreground text-sm wrap-anywhere">
                    {color}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <Sample label="Heading · 30 px / Geist">
                <p className="text-3xl font-medium tracking-[-0.03em]">
                  A little hello.
                </p>
              </Sample>
              <Sample label="Body · 16 px / Geist">
                <p className="text-muted-foreground text-base leading-relaxed">
                  Small talk gets easier with a little practice. Start wherever
                  you feel comfortable.
                </p>
              </Sample>
              <Sample label="Annotation · Shantell Sans">
                <p className="font-handwriting text-muted-foreground text-xl">
                  make it your own
                </p>
              </Sample>
            </div>
          </Section>
          <Section
            title="Buttons"
            description="Comfortable app controls: 48 px standard buttons, 52 px main actions, and at least 44 px for compact controls."
          >
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {buttonVariants.map((variant) => (
                <Sample key={variant} label={variant}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant={variant}
                      onClick={() =>
                        setLastAction(`${variant} button pressed.`)
                      }
                    >
                      Continue
                      <ArrowRight aria-hidden="true" />
                    </Button>
                    <Button variant={variant} disabled>
                      Disabled
                    </Button>
                  </div>
                </Sample>
              ))}
            </div>
            <Separator className="my-8" />
            <div className="flex flex-wrap items-end gap-6">
              {(
                [
                  {
                    size: "xs",
                    label: "Compact · 44 px",
                    detail: "14 px label",
                  },
                  { size: "sm", label: "Small · 44 px", detail: "15 px label" },
                  {
                    size: "default",
                    label: "Default · 48 px",
                    detail: "16 px label",
                  },
                  { size: "lg", label: "Large · 52 px", detail: "18 px label" },
                ] as const
              ).map(({ size, label, detail }) => (
                <Sample key={size} label={detail}>
                  <Button
                    size={size}
                    variant="outline"
                    onClick={() => setLastAction(`${label} pressed.`)}
                  >
                    {label}
                  </Button>
                </Sample>
              ))}
              <Button disabled>
                <LoaderCircle
                  aria-hidden="true"
                  className="motion-safe:animate-spin"
                />
                Connecting…
              </Button>
              <SelectChoiceButton
                onClick={() => setLastAction("Place selected.")}
              >
                Select place
              </SelectChoiceButton>
            </div>
            <output
              className="text-muted-foreground mt-5 block text-sm"
              aria-live="polite"
            >
              {lastAction}
            </output>
            <div className="mt-10 grid grid-cols-3 gap-5 sm:grid-cols-6">
              {Object.entries(icons).map(([name, Icon]) => (
                <div key={name} className="flex flex-col items-center gap-3">
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={1.75}
                  />
                  <span className="text-muted-foreground text-center text-xs wrap-anywhere">
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </Section>
          <Section
            title="Cards"
            description="Illustrated benefit cards introduce what you can practice during onboarding."
          >
            <OnboardingBenefits ids={onboardingBenefitIds} />
          </Section>
          <Section
            title="Skills"
            description="All 11 practice skills with small crayon illustrations. Pick up to three to preview selection states; suggestion badges are examples."
          >
            <SkillsPreview />
          </Section>
          <Section
            title="Selection"
            description="The studio’s place picker, selection button, chevrons, and illustrated scenes. Browse the places and open a photo."
          >
            <SelectionPreview />
          </Section>
          <Section
            title="Avatars"
            description="Our practice partners, with the shared 56 px avatar and selected ring. Choose one to compare states."
          >
            <AvatarPreview />
          </Section>
          <Section
            title="Voice"
            description="The circular talk control, Chit’s animated icon, and audio waveforms. These are visual previews; they don’t access your microphone or start a conversation."
          >
            <VoicePreview />
            <WatercolorWavePreview />
          </Section>
          <Section
            title="Forms"
            description="Language, conversation mode, and text inputs with their help, error, and disabled states."
          >
            <FormPreview />
          </Section>
          <Section
            title="Chat"
            description="A little room to talk. A conversation thread and a spacious input with its controls tucked below."
          >
            <ChatInputPreview />
          </Section>
          <Section
            title="Feedback"
            description="Status badges, notices, cards, and the conversation bubbles you see during practice."
          >
            <div className="flex flex-wrap gap-3">
              {(
                [
                  "default",
                  "secondary",
                  "outline",
                  "success-light",
                  "warning-light",
                  "destructive-light",
                  "info-light",
                  "primary-light",
                  "invert-light",
                  "focus-light",
                  "info",
                  "success",
                  "warning",
                  "destructive",
                  "invert",
                  "focus",
                  "primary-outline",
                  "info-outline",
                  "success-outline",
                  "warning-outline",
                  "destructive-outline",
                  "invert-outline",
                  "focus-outline",
                ] as const
              ).map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </div>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div className="space-y-4">
                <Alert>
                  <Check aria-hidden="true" />
                  <AlertTitle>You’re ready</AlertTitle>
                  <AlertDescription>
                    Your scene is set. Take your time.
                  </AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <AlertTitle>Connection interrupted</AlertTitle>
                  <AlertDescription>
                    Take a breath and try again when you’re ready.
                  </AlertDescription>
                </Alert>
                <Card>
                  <CardHeader>
                    <CardTitle>A little progress</CardTitle>
                    <CardDescription>
                      Every conversation counts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-base">
                    You made an introduction and kept the conversation going.
                  </CardContent>
                </Card>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border p-5">
                <ConversationMessage
                  transcriptId="theme"
                  name="Alex"
                  avatar="/images/personas/alex.svg"
                  message={{
                    id: 1,
                    speaker: "partner",
                    text: "Hey! Is this seat taken?",
                  }}
                />
                <ConversationMessage
                  transcriptId="theme"
                  name="Alex"
                  message={{
                    id: 2,
                    speaker: "user",
                    text: "Not at all. Go ahead!",
                  }}
                />
                <ConversationMessage
                  transcriptId="theme"
                  name="Alex"
                  message={{
                    id: 3,
                    speaker: "partner",
                    text: "Thanks! Do you come here often?",
                  }}
                />
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
