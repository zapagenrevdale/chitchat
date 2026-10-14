import { practiceSelectionSchema } from "@chitchat/contracts";
import { onboardingProfileSchema } from "@chitchat/contracts/onboarding";
import { describe, expect, it, vi } from "vitest";

import { buildSystemInstruction } from "./catalog";
import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const answer = {
  name: "Alex",
  language: "Japanese",
  motivation: "I want to listen better and make friends.",
};
const recommendation = {
  acknowledgment: "We can practice getting to know someone together.",
  suggestedSkills: ["listening", "conversation-flow"],
};

function setup() {
  const recommendOnboarding = vi
    .fn<NonNullable<PracticeProvider["recommendOnboarding"]>>()
    .mockResolvedValue({
      ...recommendation,
      suggestedSkills: ["listening", "conversation-flow"],
    });
  const provider = {
    createSession: vi.fn<PracticeProvider["createSession"]>(),
    recommendOnboarding,
  };
  const app = createPracticeRoutes(provider, origin);
  const post = (body: unknown, requestOrigin = origin) =>
    app.request("/onboarding-recommendations", {
      method: "POST",
      headers: { origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { post, provider };
}

describe("onboarding recommendations", () => {
  it("validates input and returns suggestions without silently selecting goals", async () => {
    const { post, provider } = setup();
    const response = await post({ ...answer, name: " Alex " });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual(recommendation);
    expect(provider.recommendOnboarding).toHaveBeenCalledWith(
      answer,
      expect.any(AbortSignal)
    );
  });

  it.each([
    { ...answer, name: " " },
    { ...answer, language: "Unknown" },
    { ...answer, motivation: "" },
    { ...answer, motivation: "x".repeat(501) },
  ])("rejects invalid answers before calling the model", async (body) => {
    const { post, provider } = setup();
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(provider.recommendOnboarding).not.toHaveBeenCalled();
  });

  it("accepts a full Unicode voice transcript and rejects a twenty-fifth message", async () => {
    const { post, provider } = setup();
    const conversation = Array.from({ length: 24 }, () => ({
      role: "user",
      text: "界".repeat(500),
    }));
    const accepted = await post({ ...answer, conversation });
    const rejected = await post({
      ...answer,
      conversation: [...conversation, conversation[0]],
    });
    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(400);
    expect(provider.recommendOnboarding).toHaveBeenCalledOnce();
  });

  it("rejects requests from another origin", async () => {
    const { post, provider } = setup();
    const response = await post(answer, "https://elsewhere.example");
    expect(response.status).toBe(403);
    expect(provider.recommendOnboarding).not.toHaveBeenCalled();
  });

  it("does not expose invalid model output or provider errors", async () => {
    const { post, provider } = setup();
    provider.recommendOnboarding.mockResolvedValueOnce({
      ...recommendation,
      suggestedSkills: ["listening", "listening"],
    });
    const invalid = await post(answer);
    expect(invalid.status).toBe(502);
    provider.recommendOnboarding.mockRejectedValueOnce(
      new Error("provider secret details")
    );
    const response = await post(answer);
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain("secret");
  });

  it("returns a recoverable response when Gemini is unavailable", async () => {
    const response = await createPracticeRoutes(undefined, origin).request(
      "/onboarding-recommendations",
      {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(answer),
      }
    );
    expect(response.status).toBe(503);
  });
});

describe("onboarding practice handoff", () => {
  const selection = {
    personaId: "maya",
    placeId: "cafe",
    settingId: "networking",
    language: "Japanese",
  };

  it("keeps learner identity and selected skills in validated live practice instructions", () => {
    const parsed = practiceSelectionSchema.parse({
      ...selection,
      learner: { name: "Alex", skills: ["listening", "wit"] },
    });
    const instruction = buildSystemInstruction(parsed);
    expect(instruction).toContain("Speak in Japanese.");
    expect(instruction).toContain('"Alex"');
    expect(instruction).toContain("Share a specific detail");
    expect(instruction).toContain("playful banter");
    expect(instruction).toContain("do not change the feedback rubric");
  });

  it.each([
    { skills: [] },
    { skills: ["listening", "listening"] },
    { skills: ["unknown"] },
    { skills: ["listening", "wit", "clear-expression", "sharing"] },
  ])("rejects invalid goal selections", ({ skills }) => {
    expect(
      practiceSelectionSchema.safeParse({
        ...selection,
        learner: { name: "Alex", skills },
      }).success
    ).toBeFalsy();
    expect(
      onboardingProfileSchema.safeParse({ version: 1, ...answer, skills })
        .success
    ).toBeFalsy();
  });
});
