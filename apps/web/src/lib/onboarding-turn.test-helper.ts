import type { OnboardingTurn } from "@chitchat/contracts/onboarding";

export function onboardingTurnResponse(turn: OnboardingTurn) {
  return new Response(`${JSON.stringify({ type: "complete", turn })}\n`, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
