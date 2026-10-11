import { z } from "zod";

export const conversationSkillIds = [
  "smooth-speaking",
  "thinking-on-your-feet",
  "listening",
  "situational-response",
  "wit",
  "clear-expression",
  "conversation-flow",
] as const;
export const conversationSkillSchema = z.enum(conversationSkillIds);
export type ConversationSkill = z.infer<typeof conversationSkillSchema>;

export const conversationSkills = [
  {
    id: "smooth-speaking",
    title: "Speak more smoothly",
    description:
      "Get your thoughts out with fewer unwanted hesitations and restarts.",
  },
  {
    id: "thinking-on-your-feet",
    title: "Know what to say next",
    description: "Find a response when someone asks something unexpected.",
  },
  {
    id: "listening",
    title: "Listen closely and ask better questions",
    description: "Pick up on details and ask thoughtful follow-up questions.",
  },
  {
    id: "situational-response",
    title: "Respond naturally in different situations",
    description:
      "Recognize when to be playful, supportive, curious, or serious.",
  },
  {
    id: "wit",
    title: "Be more playful and witty",
    description: "Try playful replies that fit the moment.",
  },
  {
    id: "clear-expression",
    title: "Tell stories and explain myself clearly",
    description: "Share your point without losing your thread.",
  },
  {
    id: "conversation-flow",
    title: "Keep conversations going",
    description:
      "Build on an answer, introduce a topic, or move through a lull.",
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
