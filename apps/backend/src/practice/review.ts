import { practiceReviewSchema } from "@chitchat/contracts";
import type {
  PracticeFeedbackRequest,
  PracticeRecapRequest,
} from "@chitchat/contracts";
import { ThinkingLevel } from "@google/genai";
import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { resolveSelection } from "./catalog";
import { feedbackInstruction, finalizeFeedback } from "./feedback";
import { speakPracticeText } from "./speech";
import { traceGeneration, tokenUsage } from "./tracing";
import type { PracticeTracing } from "./tracing";

export function createFeedbackProvider(
  ai: GoogleGenAI,
  tracing?: PracticeTracing
) {
  return {
    async assessConversation(
      request: PracticeFeedbackRequest,
      signal: AbortSignal
    ) {
      const scene = resolveSelection(request.selection);
      if (!scene) {
        throw new Error("Invalid practice selection.");
      }
      const model = "gemini-3.6-flash";
      const contents = JSON.stringify({
        scene: {
          place: scene.place,
          situation: scene.setting,
          partnerName: scene.persona.name,
          backstory: request.selection.backstory,
          preview: request.selection.scenePreview,
          goal: request.selection.goal,
        },
        messages: request.messages,
      });
      const result = await traceGeneration(
        "assess-practice-transcript",
        {
          model,
          input: { systemInstruction: feedbackInstruction, contents },
          metadata: { rubricVersion: "transcript-v1" },
        },
        async (observation) => {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              abortSignal: signal,
              systemInstruction: feedbackInstruction,
              responseMimeType: "application/json",
              responseJsonSchema: z.toJSONSchema(practiceReviewSchema),
              maxOutputTokens: 2500,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          signal.throwIfAborted();
          // Preserve malformed model output too, so failed assessments can be diagnosed.
          observation.update({
            output: response.text,
            usageDetails: tokenUsage(response.usageMetadata),
          });
          const { assessment } = practiceReviewSchema.parse(
            JSON.parse(response.text ?? "null")
          );
          // Validate evidence before exposing or speaking any feedback.
          const feedback = assessment
            ? finalizeFeedback(assessment, request.messages)
            : { status: "insufficient" as const };
          return { feedback, usage: response.usageMetadata };
        },
        ({ feedback, usage }) => ({
          output: feedback,
          usageDetails: tokenUsage(usage),
        }),
        tracing?.sessionId(request.tracingToken)
      );
      return result.feedback;
    },
    async speakFeedback(request: PracticeRecapRequest, signal: AbortSignal) {
      const scene = resolveSelection(request.selection);
      if (!scene) {
        throw new Error("Invalid practice selection.");
      }
      const { feedback } = request;
      // Recalculate the total rather than trusting a round-tripped client total.
      const score =
        feedback.status === "scored"
          ? Math.round(
              ((feedback.curiosity.score +
                feedback.listening.score +
                feedback.sharing.score) /
                15) *
                10
            )
          : undefined;
      // Assemble only confirmed feedback. TTS delivers it; it does not reassess.
      const text =
        feedback.status === "scored"
          ? `Your conversation score is ${score} out of ten. ${feedback.highlight?.note ?? feedback.summary} ${feedback.nextStep.tip}`
          : "Let's try a few more back-and-forth turns next time so I have enough conversation to give you useful feedback.";
      return await speakPracticeText(
        ai,
        { selection: request.selection, text },
        signal,
        tracing?.sessionId(request.tracingToken)
      );
    },
  };
}
