import { z } from "zod";

export const conversationSkillIds = [
  "start-conversations",
  "conversation-flow",
  "listening",
  "sharing",
  "clear-expression",
  "wit",
  "respond-with-care",
  "self-advocacy",
  "disagreement",
  "clarification",
  "end-conversations",
] as const;
export const conversationSkillSchema = z.enum(conversationSkillIds);
export type ConversationSkill = z.infer<typeof conversationSkillSchema>;

export const conversationSkills = [
  {
    id: "start-conversations",
    title: "Start conversations",
    description: "Introduce yourself and find something to talk about.",
  },
  {
    id: "conversation-flow",
    title: "Keep conversations going",
    description: "Build on a topic, add something, or move to another one.",
  },
  {
    id: "listening",
    title: "Listen and ask thoughtful questions",
    description: "Follow what someone says and show you understood.",
  },
  {
    id: "sharing",
    title: "Share more about myself",
    description:
      "Talk about your interests, experiences, and opinions at a level you're comfortable with.",
  },
  {
    id: "clear-expression",
    title: "Explain my thoughts clearly",
    description: "Get your point across without losing your thread.",
  },
  {
    id: "wit",
    title: "Be more playful",
    description: "Try lighthearted replies and build on a shared joke.",
  },
  {
    id: "respond-with-care",
    title: "Respond with care",
    description: "Acknowledge someone's feelings and ask what would help.",
  },
  {
    id: "self-advocacy",
    title: "Speak up for myself",
    description: "Make requests, say no, and express what you need.",
  },
  {
    id: "disagreement",
    title: "Handle disagreements",
    description: "Explain a different view and understand the other person's.",
  },
  {
    id: "clarification",
    title: "Clear up misunderstandings",
    description: "Ask for clarification and rephrase your own meaning.",
  },
  {
    id: "end-conversations",
    title: "End conversations comfortably",
    description: "Bring things to a close and say goodbye.",
  },
] as const satisfies readonly {
  id: ConversationSkill;
  title: string;
  description: string;
}[];

export const selectedSkillsSchema = z
  .array(conversationSkillSchema)
  .max(3)
  .refine(
    (skills) => new Set(skills).size === skills.length,
    "Choose each skill only once."
  );
export const learnerContextSchema = z.object({
  name: z.string().trim().min(1).max(60),
  skills: selectedSkillsSchema.min(1),
});
export type LearnerContext = z.infer<typeof learnerContextSchema>;
