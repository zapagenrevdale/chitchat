export type PracticeState =
  | "idle"
  | "starting"
  | "listening"
  | "talking"
  | "reconnecting"
  | "reviewing"
  | "ended";
export interface PracticeTranscript {
  user: string;
  partner: string;
}
export interface PracticeMessage {
  id: number;
  speaker: "user" | "partner";
  text: string;
  suggestionShown?: boolean;
}
