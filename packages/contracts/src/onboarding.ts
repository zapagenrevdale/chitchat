import { z } from "zod";

import {
  learnerContextSchema,
  selectedSkillsSchema,
} from "./conversation-goals";
import { practiceLanguageSchema } from "./languages";

export const onboardingBenefitIds = [
  "start-conversations",
  "keep-it-going",
  "think-on-your-feet",
  "listen-and-connect",
  "tell-stories",
  "express-yourself",
  "speak-smoothly",
  "work-conversations",
  "handle-disagreement",
  "playful-conversations",
  "everyday-language",
  "useful-feedback",
  "clear-up-misunderstandings",
  "everyday-tasks",
  "respond-with-care",
  "end-conversations",
] as const;
export type OnboardingBenefit = (typeof onboardingBenefitIds)[number];
export const defaultOnboardingBenefits: OnboardingBenefit[] = [
  "speak-smoothly",
  "express-yourself",
  "listen-and-connect",
];
export const onboardingBenefitsSchema = z.object({
  ids: z
    .array(z.enum(onboardingBenefitIds))
    .length(3)
    .refine(
      (ids) => new Set(ids).size === 3,
      "Choose three distinct benefits."
    ),
  personalized: z.boolean(),
});
export type OnboardingBenefits = z.infer<typeof onboardingBenefitsSchema>;

export const onboardingSteps = [
  "language",
  "name",
  "microphone",
  "motivation",
  "benefits",
  "skills",
] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];
export const onboardingGoalStatusSchema = z.enum(["ready", "choose"]);
export type OnboardingGoalStatus = z.infer<typeof onboardingGoalStatusSchema>;
export const onboardingConversationModeSchema = z.enum(["text", "voice"]);
export type OnboardingConversationMode = z.infer<
  typeof onboardingConversationModeSchema
>;
function hasValidGoal(state: {
  motivation: string;
  goalStatus?: OnboardingGoalStatus;
}) {
  return state.goalStatus === "choose"
    ? state.motivation === ""
    : state.motivation.length > 0;
}
export const onboardingProfileSchema = learnerContextSchema
  .extend({
    version: z.literal(1),
    language: practiceLanguageSchema,
    motivation: z.string().trim().max(500),
    // Existing completed profiles without a status remain ready profiles.
    goalStatus: onboardingGoalStatusSchema.optional(),
  })
  .refine(hasValidGoal, "Add a goal or explicitly choose your own skills.");
export type OnboardingProfile = z.infer<typeof onboardingProfileSchema>;
export const onboardingMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(500),
});
export type OnboardingMessage = z.infer<typeof onboardingMessageSchema>;

export const onboardingRecommendationRequestSchema = z
  .object({
    name: learnerContextSchema.shape.name,
    language: practiceLanguageSchema,
    motivation: z.string().trim().max(500),
    goalStatus: onboardingGoalStatusSchema.optional(),
    conversation: z.array(onboardingMessageSchema).max(24).optional(),
  })
  .refine(hasValidGoal, "Add a goal or explicitly choose your own skills.");
export type OnboardingRecommendationRequest = z.infer<
  typeof onboardingRecommendationRequestSchema
>;
export const onboardingRecommendationSchema = z.object({
  acknowledgment: z.string().trim().min(1).max(240),
  suggestedSkills: selectedSkillsSchema,
  benefits: onboardingBenefitsSchema.optional(),
});
export type OnboardingRecommendation = z.infer<
  typeof onboardingRecommendationSchema
>;

export const onboardingTurnRequestSchema = z.object({
  name: onboardingProfileSchema.shape.name,
  language: practiceLanguageSchema,
  messages: z
    .array(onboardingMessageSchema)
    .min(1)
    .max(5)
    .refine(
      (messages) =>
        messages.length % 2 === 1 &&
        messages.every(
          (message, index) =>
            message.role === (index % 2 === 0 ? "user" : "assistant")
        ),
      "Send alternating turns ending with the learner's answer."
    ),
});
export type OnboardingTurnRequest = z.infer<typeof onboardingTurnRequestSchema>;
const onboardingOutcomeShape = {
  goal: z.string().trim().max(500),
  suggestedSkills: selectedSkillsSchema,
};
function hasValidOutcome(outcome: {
  status: "clarify" | "ready" | "choose";
  goal: string;
  suggestedSkills: readonly unknown[];
}) {
  return outcome.status === "ready"
    ? Boolean(outcome.goal)
    : outcome.goal === "" && outcome.suggestedSkills.length === 0;
}
export const onboardingTurnSchema = z
  .object({
    status: z.enum(["clarify", "ready", "choose"]),
    reply: z.string().trim().min(1).max(240),
    ...onboardingOutcomeShape,
    benefits: onboardingBenefitsSchema.optional(),
  })
  .refine(hasValidOutcome);
export type OnboardingTurn = z.infer<typeof onboardingTurnSchema>;

export const onboardingTurnEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reply"), reply: z.string().max(240) }),
  z.object({ type: z.literal("complete"), turn: onboardingTurnSchema }),
  z.object({ type: z.literal("error"), error: z.string().min(1).max(240) }),
]);
export type OnboardingTurnEvent = z.infer<typeof onboardingTurnEventSchema>;

export const onboardingDraftSchema = z.object({
  version: z.literal(1),
  skillRecommendationsVersion: z.literal(2).optional(),
  step: z.enum(onboardingSteps),
  conversation: z.array(onboardingMessageSchema).max(24).optional(),
  conversationMode: onboardingConversationModeSchema.optional(),
  goalStatus: onboardingGoalStatusSchema.optional(),
  resolvedGoal: onboardingTurnSchema
    .refine((turn) => turn.status !== "clarify")
    .optional(),
  language: practiceLanguageSchema,
  name: z.string().max(60),
  motivation: z.string().max(500),
  skills: selectedSkillsSchema,
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export const onboardingLiveRequestSchema = z.strictObject({
  name: onboardingProfileSchema.shape.name,
  language: practiceLanguageSchema,
});
export type OnboardingLiveRequest = z.infer<typeof onboardingLiveRequestSchema>;
export const onboardingLiveModel = "gemini-3.8-live";
export const onboardingTextModel = "gemini-3.8-flash";
export const onboardingLiveMaxDurationMs = 180_000;
export const onboardingLiveSessionSchema = z.object({
  token: z.string().startsWith("auth_tokens/"),
  model: z.literal(onboardingLiveModel),
  apiVersion: z.literal("v1beta"),
  expiresAt: z.number().int().positive(),
  maxDurationMs: z.literal(onboardingLiveMaxDurationMs),
  tracingToken: z.uuid().optional(),
});
export type OnboardingLiveSession = z.infer<typeof onboardingLiveSessionSchema>;
export const onboardingCompleteToolName = "complete_onboarding";
export const onboardingCompleteSchema = z
  .strictObject({
    status: z.enum(["ready", "choose"]),
    goal: z.string().trim().max(500),
  })
  .refine((outcome) =>
    outcome.status === "ready" ? Boolean(outcome.goal) : outcome.goal === ""
  );
export type OnboardingComplete = z.infer<typeof onboardingCompleteSchema>;

export const onboardingVoiceCompletionRequestSchema = z
  .object({
    name: learnerContextSchema.shape.name,
    language: practiceLanguageSchema,
    outcome: onboardingCompleteSchema,
    messages: z.array(onboardingMessageSchema).max(24),
  })
  .refine(
    ({ outcome, messages }) =>
      outcome.status === "choose" ||
      messages.some((message) => message.role === "user"),
    "A completed goal needs the learner's own words."
  );
export type OnboardingVoiceCompletionRequest = z.infer<
  typeof onboardingVoiceCompletionRequestSchema
>;
export const onboardingVoiceCompletionSchema = onboardingCompleteSchema
  .safeExtend({
    suggestedSkills: selectedSkillsSchema,
    benefits: onboardingBenefitsSchema.optional(),
  })
  .refine(hasValidOutcome);
export type OnboardingVoiceCompletion = z.infer<
  typeof onboardingVoiceCompletionSchema
>;

const legacySkillsSchema = z
  .array(
    z.enum([
      "smooth-speaking",
      "thinking-on-your-feet",
      "listening",
      "situational-response",
      "wit",
      "clear-expression",
      "conversation-flow",
    ])
  )
  .max(3)
  .refine((skills) => new Set(skills).size === skills.length);
export const legacyOnboardingProfileSchema = z
  .object({
    ...onboardingProfileSchema.shape,
    skills: legacySkillsSchema.min(1),
  })
  .refine(hasValidGoal);
export const legacyOnboardingDraftSchema = onboardingDraftSchema.extend({
  skills: legacySkillsSchema,
  resolvedGoal: z
    .object({
      ...onboardingTurnSchema.shape,
      suggestedSkills: legacySkillsSchema,
    })
    .refine(hasValidOutcome)
    .refine((turn) => turn.status !== "clarify")
    .optional(),
});
