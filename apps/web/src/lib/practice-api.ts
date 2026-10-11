import {
  guidedTurnSchema,
  practiceReplySchema,
  practiceTranscriptionSessionSchema,
  practiceFeedbackSchema,
  practiceRecapSchema,
  personaRecommendationSchema,
  practiceScenePreviewSchema,
  practiceOptionsSchema,
  practiceSessionSchema,
  practiceSetupResponseSchema,
} from "@chitchat/contracts";
import type {
  GuidedTurnRequest,
  PracticeReplyRequest,
  PracticeSpeechRequest,
  PracticeFeedbackRequest,
  PracticeRecapRequest,
  PersonaRecommendationRequest,
  PracticeScenePreviewRequest,
  CustomPlaceSummary,
  PracticeSelection,
  PracticeSetupRequest,
} from "@chitchat/contracts";
import {
  onboardingLiveSessionSchema,
  onboardingRecommendationSchema,
  onboardingVoiceCompletionSchema,
} from "@chitchat/contracts/onboarding";
import type {
  OnboardingLiveRequest,
  OnboardingTurnRequest,
  OnboardingVoiceCompletionRequest,
  OnboardingRecommendationRequest,
} from "@chitchat/contracts/onboarding";
import { queryOptions } from "@tanstack/react-query";

import { apiUrl } from "./env";
import { readOnboardingTurn } from "./onboarding-turn-stream";

export class PracticeApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PracticeApiError";
    this.status = status;
  }
}

async function request(path: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(`${apiUrl}/api/practice${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: path === "/onboarding-sessions" ? "include" : "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "Something went wrong. Please try again.";
    throw new PracticeApiError(message, response.status);
  }
  return result;
}

export const practiceOptionsQuery = queryOptions({
  queryKey: ["practice-options"],
  queryFn: async ({ signal }) =>
    practiceOptionsSchema.parse(await request("/options", signal)),
  staleTime: 60_000,
});

export function onboardingRecommendationQuery(
  body: OnboardingRecommendationRequest
) {
  return queryOptions({
    queryKey: ["onboarding-recommendation", body],
    queryFn: async ({ signal }) =>
      onboardingRecommendationSchema.parse(
        await request("/onboarding-recommendations", signal, body)
      ),
    staleTime: Infinity,
    retry: false,
  });
}

export async function finalizePracticeFeedback(
  body: PracticeFeedbackRequest,
  signal: AbortSignal
) {
  return practiceFeedbackSchema.parse(await request("/feedback", signal, body));
}

export async function speakPracticeFeedback(
  body: PracticeRecapRequest,
  signal: AbortSignal
) {
  return practiceRecapSchema.parse(
    await request("/feedback-speech", signal, body)
  );
}

export function practiceScenePreviewQuery(body: PracticeScenePreviewRequest) {
  return queryOptions({
    queryKey: ["practice-scene-preview", body],
    queryFn: async ({ signal }) =>
      practiceScenePreviewSchema.parse(
        await request("/scene-previews", signal, body)
      ),
    staleTime: Infinity,
    retry: false,
  });
}
export async function createPracticeSession(
  selection: PracticeSelection,
  signal: AbortSignal
) {
  return practiceSessionSchema.parse(
    await request("/sessions", signal, selection)
  );
}

export async function createOnboardingSession(
  body: OnboardingLiveRequest,
  signal: AbortSignal
) {
  return onboardingLiveSessionSchema.parse(
    await request("/onboarding-sessions", signal, body)
  );
}

export async function completeOnboardingVoice(
  body: OnboardingVoiceCompletionRequest,
  signal: AbortSignal
) {
  return onboardingVoiceCompletionSchema.parse(
    await request("/onboarding-completions", signal, body)
  );
}

export async function createCustomPlaceSession(signal: AbortSignal) {
  return practiceSessionSchema.parse(
    await request("/place-sessions", signal, {})
  );
}

export async function createCustomSituationSession(
  place: CustomPlaceSummary,
  signal: AbortSignal
) {
  return practiceSessionSchema.parse(
    await request("/situation-sessions", signal, { place })
  );
}

export async function resolvePracticeSetup(
  body: PracticeSetupRequest,
  signal: AbortSignal
) {
  return practiceSetupResponseSchema.parse(
    await request("/setup", signal, body)
  );
}

export async function recommendPersonas(
  body: PersonaRecommendationRequest,
  signal: AbortSignal
) {
  return personaRecommendationSchema.parse(
    await request("/persona-recommendations", signal, body)
  );
}

export async function suggestPracticeReply(
  body: PracticeReplyRequest,
  signal: AbortSignal
) {
  return practiceReplySchema.parse(
    await request("/reply-suggestions", signal, body)
  );
}
export async function generateGuidedTurn(
  body: GuidedTurnRequest,
  signal: AbortSignal
) {
  return guidedTurnSchema.parse(await request("/guided-turns", signal, body));
}
export async function speakPracticeTurn(
  body: PracticeSpeechRequest,
  signal: AbortSignal
) {
  return practiceRecapSchema.parse(await request("/turn-speech", signal, body));
}
export async function createTranscriptionSession(signal: AbortSignal) {
  return practiceTranscriptionSessionSchema.parse(
    await request("/transcription-sessions", signal, {})
  );
}

export async function replyToOnboarding(
  body: OnboardingTurnRequest,
  signal: AbortSignal,
  onReply: (reply: string) => void
) {
  const response = await fetch(`${apiUrl}/api/practice/onboarding-turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  signal.throwIfAborted();
  if (!response.ok || !response.body) {
    throw new PracticeApiError(
      "Chit couldn't reply. Try again or choose your skills.",
      response.status
    );
  }
  if (
    !response.headers.get("Content-Type")?.startsWith("application/x-ndjson")
  ) {
    await response.body.cancel();
    throw new Error("Unexpected reply format.");
  }
  return readOnboardingTurn(response.body, signal, onReply);
}
