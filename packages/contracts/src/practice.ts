import { z } from "zod";

import { learnerContextSchema } from "./conversation-goals";

export const practiceLanguages = [
  "Arabic",
  "Chinese",
  "Danish",
  "Dutch",
  "English",
  "Filipino",
  "French",
  "German",
  "Greek",
  "Hebrew",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Norwegian",
  "Persian",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Swedish",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Vietnamese",
] as const;
export const practiceLanguageSchema = z.enum(practiceLanguages);
export type PracticeLanguage = z.infer<typeof practiceLanguageSchema>;

const optionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

export const practiceOptionsSchema = z.object({
  personaGroups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      personaIds: z.array(z.string()).min(1),
    })
  ),
  personas: z.array(
    optionSchema.extend({
      voice: z.string().min(1),
      introduction: z.string().min(1),
      introductionAudio: z.string().startsWith("/audio/personas/"),
      avatar: z.string().startsWith("/images/personas/").endsWith(".svg"),
      gender: z.enum(["Female", "Male"]),
      pitch: z.enum(["Higher", "Middle", "Lower middle", "Lower"]),
      tags: z.array(z.string().min(1)).min(1),
    })
  ),
  places: z.array(optionSchema),
  settings: z.array(
    optionSchema.extend({
      placeIds: z.array(z.string()),
      objectives: z.array(z.string()).length(3),
    })
  ),
  levels: z.array(optionSchema),
  available: z.boolean(),
});
export const practiceSceneSummarySchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(300),
});
export const practiceScenePreviewSchema = practiceSceneSummarySchema.extend({
  goal: z.string().trim().min(1).max(200),
});
const backstorySchema = z.string().trim().min(1).max(1000);

export const practiceSelectionSchema = z.object({
  learner: learnerContextSchema.optional(),
  language: practiceLanguageSchema.optional(),
  personaId: z.string().min(1).max(50),
  placeId: z.string().min(1).max(50),
  settingId: z.string().min(1).max(50),
  customPlace: z.string().trim().min(1).max(200).optional(),
  customSetting: z.string().trim().min(1).max(200).optional(),
  mode: z.enum(["free", "guided"]).optional(),
  difficulty: z.enum(["easy", "balanced", "stretch"]).optional(),
  backstory: backstorySchema.optional(),
  scenePreview: practiceSceneSummarySchema.optional(),
  goal: practiceScenePreviewSchema.shape.goal.optional(),
});
export const practiceDraftSchema = practiceSelectionSchema
  .omit({ backstory: true, scenePreview: true, goal: true })
  .partial();
export const practiceStepSchema = z.enum([
  "place",
  "setting",
  "difficulty",
  "persona",
]);
export const practiceSetupRequestSchema = z
  .object({
    selection: practiceDraftSchema,
    step: practiceStepSchema,
    action: z.enum(["answer", "random", "random-all"]),
    text: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => value.action !== "answer" || Boolean(value.text), {
    message: "Describe your choice first.",
  });
export const practiceSetupResponseSchema = z.object({
  selection: practiceDraftSchema,
});
export const practiceSessionSchema = z.object({
  token: z.string().startsWith("auth_tokens/"),
  model: z.literal("gemini-3.1-flash-live-preview"),
  expiresAt: z.number(),
  tracingToken: z.uuid().optional(),
  transcriptionToken: z
    .string()
    .startsWith("auth_tokens/")
    .nullable()
    .optional(),
});

export const endConversationToolName = "end_conversation";
export const endConversationSchema = z.object({
  reason: z.enum(["user_requested_stop", "mutual_goodbye"]),
});

export const customPlaceToolName = "summarize_place";
export const customSituationToolName = "summarize_situation";
export const customChoiceSummarySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200),
});
export const customPlaceSummarySchema = customChoiceSummarySchema;
export const practiceScenePreviewRequestSchema = z.object({
  place: customChoiceSummarySchema,
  situation: customChoiceSummarySchema,
  personaId: practiceSelectionSchema.shape.personaId,
  backstory: backstorySchema.optional(),
});
export type PracticeScenePreviewRequest = z.infer<
  typeof practiceScenePreviewRequestSchema
>;
export type PracticeScenePreview = z.infer<typeof practiceScenePreviewSchema>;
export const placeImageRequestSchema = customPlaceSummarySchema.extend({
  scene: z
    .object({
      situation: customChoiceSummarySchema,
      personaId: practiceSelectionSchema.shape.personaId,
    })
    .optional(),
});
export const customSituationRequestSchema = z.object({
  place: customPlaceSummarySchema,
});

export type CustomPlaceSummary = z.infer<typeof customPlaceSummarySchema>;
export type CustomChoiceSummary = z.infer<typeof customChoiceSummarySchema>;
export type PlaceImageRequest = z.infer<typeof placeImageRequestSchema>;

export type PracticeOptions = z.infer<typeof practiceOptionsSchema>;
export type PracticeSelection = z.infer<typeof practiceSelectionSchema>;
export type PracticeDraft = z.infer<typeof practiceDraftSchema>;
export type PracticeStep = z.infer<typeof practiceStepSchema>;
export type PracticeSetupRequest = z.infer<typeof practiceSetupRequestSchema>;
export type PracticeSession = z.infer<typeof practiceSessionSchema>;

const traceEventBase = {
  timestamp: z.number().finite().nonnegative(),
  sequence: z.number().int().nonnegative(),
};
const liveTokenCountSchema = z.number().int().min(0).max(100_000_000);
const liveTokenDetailsSchema = z
  .array(
    z.object({
      modality: z.enum([
        "TEXT",
        "AUDIO",
        "IMAGE",
        "VIDEO",
        "MODALITY_UNSPECIFIED",
      ]),
      tokenCount: liveTokenCountSchema,
    })
  )
  .max(8);
export const practiceTraceEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...traceEventBase,
    type: z.literal("usage"),
    usage: z.object({
      promptTokenCount: liveTokenCountSchema.optional(),
      responseTokenCount: liveTokenCountSchema.optional(),
      totalTokenCount: liveTokenCountSchema.optional(),
      thoughtsTokenCount: liveTokenCountSchema.optional(),
      promptTokensDetails: liveTokenDetailsSchema.optional(),
      responseTokensDetails: liveTokenDetailsSchema.optional(),
    }),
  }),
  z.object({
    ...traceEventBase,
    type: z.literal("transcript"),
    speaker: z.enum(["user", "partner"]),
    text: z.string().max(8000),
    messageId: z.number().int().nonnegative(),
  }),
  z.object({
    ...traceEventBase,
    type: z.literal("tool"),
    name: z.string().max(100),
    callId: z.string().max(200).optional(),
    arguments: z.string().max(2000),
    accepted: z.boolean(),
  }),
  z.object({
    ...traceEventBase,
    type: z.literal("lifecycle"),
    name: z.enum([
      "connected",
      "disconnected",
      "reconnecting",
      "interrupted",
      "playback_started",
      "playback_finished",
      "ending",
      "review_requested",
      "review_turn_completed",
      "tool_cancelled",
      "closed",
      "error",
    ]),
    detail: z.string().max(1000).optional(),
  }),
]);
export const practiceTraceBatchSchema = z.object({
  tracingToken: z.uuid(),
  events: z.array(practiceTraceEventSchema).min(1).max(8),
});
export type PracticeTraceEvent = z.infer<typeof practiceTraceEventSchema>;
export type PracticeTraceBatch = z.infer<typeof practiceTraceBatchSchema>;

export const personaRecommendationRequestSchema = z.object({
  place: customChoiceSummarySchema,
  situation: customChoiceSummarySchema,
});
export const personaRecommendationSchema = z.object({
  name: z.string().trim().min(1).max(60),
  personaIds: z.array(z.string().min(1).max(50)).min(3).max(6),
});
export type PersonaRecommendationRequest = z.infer<
  typeof personaRecommendationRequestSchema
>;
export type PersonaRecommendation = z.infer<typeof personaRecommendationSchema>;

export const practiceTranscriptLimits = {
  messages: 300,
  messageCharacters: 8000,
  totalCodeUnits: 60_000,
} as const;

const practiceMessagesSchema = z
  .array(
    z.object({
      id: z.number().int().nonnegative(),
      speaker: z.enum(["user", "partner"]),
      text: z.string().max(practiceTranscriptLimits.messageCharacters),
      suggestionShown: z.boolean().optional(),
    })
  )
  .max(practiceTranscriptLimits.messages)
  .refine(
    (messages) =>
      new Set(messages.map(({ id }) => id)).size === messages.length &&
      messages.reduce((length, message) => length + message.text.length, 0) <=
        practiceTranscriptLimits.totalCodeUnits,
    "The transcript is too long or contains duplicate messages."
  );

const skillSchema = z.object({
  score: z.number().int().min(0).max(5),
  note: z.string().trim().min(1).max(180),
});

// Keep the model's assessment separate from the server-calculated overall score.
export const practiceAssessmentSchema = z.object({
  summary: z.string().trim().min(1).max(180),
  curiosity: skillSchema,
  listening: skillSchema,
  sharing: skillSchema,
  highlight: z
    .object({
      messageId: z.number().int().nonnegative(),
      quote: z.string().trim().min(1).max(240),
      note: z.string().trim().min(1).max(180),
    })
    .nullable(),
  nextStep: z.object({
    tip: z.string().trim().min(1).max(180),
  }),
});

export const practiceReviewSchema = z.object({
  // Null means the transcript contains too little usable evidence.
  assessment: practiceAssessmentSchema.nullable(),
});
export const practiceFeedbackRequestSchema = z.object({
  selection: practiceSelectionSchema,
  messages: practiceMessagesSchema,
  tracingToken: z.string().uuid().optional(),
});

export const practiceFeedbackSchema = z.discriminatedUnion("status", [
  practiceAssessmentSchema.extend({
    status: z.literal("scored"),
    score: z.number().int().min(0).max(10),
  }),
  z.object({ status: z.literal("insufficient") }),
]);

export const practiceRecapRequestSchema = z.object({
  selection: practiceSelectionSchema,
  feedback: practiceFeedbackSchema,
  tracingToken: z.string().uuid().optional(),
});
export const practiceRecapSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  audio: z.string().min(1).max(8_000_000),
  mimeType: z.string().regex(/^audio\/pcm;rate=24000(?:;.*)?$/u),
});
export type PracticeRecapRequest = z.infer<typeof practiceRecapRequestSchema>;
export type PracticeRecap = z.infer<typeof practiceRecapSchema>;

export type PracticeFeedbackRequest = z.infer<
  typeof practiceFeedbackRequestSchema
>;
export type PracticeAssessment = z.infer<typeof practiceAssessmentSchema>;
export type PracticeFeedback = z.infer<typeof practiceFeedbackSchema>;

const captionSegmentSchema = z.object({
  text: z.string().optional(),
  finished: z.boolean().optional(),
});
export const practiceTranscriptionEventSchema = z.object({
  setupComplete: z.object({}).optional(),
  error: z.unknown().optional(),
  goAway: z.object({}).optional(),
  serverContent: z
    .object({
      interimInputTranscription: captionSegmentSchema.optional(),
      inputTranscription: captionSegmentSchema.optional(),
    })
    .optional(),
});

export const practiceReplySchema = z.object({
  text: z.string().trim().min(1).max(240),
});
export const practiceReplyRequestSchema = z.object({
  selection: practiceSelectionSchema,
  messages: practiceMessagesSchema,
  previous: z.string().max(240).optional(),
});
export const guidedTurnRequestSchema = z.object({
  selection: practiceSelectionSchema,
  messages: practiceMessagesSchema,
  skipped: z.boolean().optional(),
});
export const guidedTurnSchema = z.object({
  text: z.string().trim().min(1).max(600),
  reply: z.string().trim().min(1).max(240),
});
export const practiceSpeechRequestSchema = z.object({
  selection: practiceSelectionSchema,
  text: z.string().trim().min(1).max(600),
});
export const practiceTranscriptionSessionSchema = z.object({
  token: z.string().startsWith("auth_tokens/"),
});
export type PracticeReplyRequest = z.infer<typeof practiceReplyRequestSchema>;
export type GuidedTurnRequest = z.infer<typeof guidedTurnRequestSchema>;
export type GuidedTurn = z.infer<typeof guidedTurnSchema>;
export type PracticeSpeechRequest = z.infer<typeof practiceSpeechRequestSchema>;
