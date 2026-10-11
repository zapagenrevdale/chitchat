import {
  defaultOnboardingBenefits,
  onboardingCompleteSchema,
  onboardingDraftSchema,
  onboardingProfileSchema,
  onboardingBenefitIds,
  onboardingVoiceCompletionRequestSchema,
} from "@chitchat/contracts/onboarding";
import type { OnboardingVoiceCompletionRequest } from "@chitchat/contracts/onboarding";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import { createGeminiProvider } from "./gemini";
import { createOnboardingProvider } from "./onboarding";
import { createPracticeRoutes } from "./routes";
import { textClient } from "./text-model.test-helper";

const origin = "https://amber.cc.local";
const request: OnboardingVoiceCompletionRequest = {
  name: "Alex",
  language: "English",
  outcome: {
    status: "ready",
    goal: "Speak clearly at work",
    suggestedSkills: ["clear-expression"],
  },
  messages: [
    { role: "assistant", text: "What would you like to practice?" },
    { role: "user", text: "Explaining my ideas in work meetings." },
  ],
};
const choose = { status: "choose" as const, goal: "", suggestedSkills: [] };

function setup() {
  const completeOnboarding = vi
    .fn<NonNullable<PracticeProvider["completeOnboarding"]>>()
    .mockResolvedValue({
      ...request.outcome,
      benefits: { ids: defaultOnboardingBenefits, personalized: false },
    });
  const app = createPracticeRoutes(
    {
      createSession: vi.fn<PracticeProvider["createSession"]>(),
      completeOnboarding,
    },
    origin
  );
  const post = (body: unknown, requestOrigin = origin) =>
    app.request("/onboarding-completions", {
      method: "POST",
      headers: { origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { post, completeOnboarding, app };
}

describe("voice goal finalization", () => {
  it("accepts independent finalized voice utterances and preserves the outcome", async () => {
    const { post, completeOnboarding } = setup();
    const body = {
      ...request,
      messages: [
        ...request.messages,
        { role: "user", text: "Especially when I present an idea." },
      ],
    };
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject(request.outcome);
    expect(completeOnboarding).toHaveBeenCalledWith(
      body,
      expect.any(AbortSignal)
    );
  });

  it("accepts the maximum Unicode transcript without expanding other route budgets", async () => {
    const { post, app, completeOnboarding } = setup();
    const body = {
      ...request,
      name: "界".repeat(60),
      outcome: { ...request.outcome, goal: "界".repeat(500) },
      messages: Array.from({ length: 24 }, () => ({
        role: "user",
        text: "界".repeat(500),
      })),
    };
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(completeOnboarding).toHaveBeenCalledWith(
      body,
      expect.any(AbortSignal)
    );
    const other = await app.request("/onboarding-sessions", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(other.status).toBe(413);
  });

  it.each([
    { ...request, messages: [] },
    { ...request, messages: [{ role: "assistant", text: "An invented goal" }] },
    {
      ...request,
      messages: Array.from({ length: 25 }, () => request.messages[1]),
    },
    { ...request, messages: [{ role: "user", text: "x".repeat(501) }] },
    { ...request, outcome: { ...request.outcome, goal: "" } },
    { ...request, outcome: { ...choose, goal: "Invented" } },
    {
      ...request,
      outcome: { ...request.outcome, suggestedSkills: ["unknown"] },
    },
    {
      ...request,
      outcome: { ...request.outcome, suggestedSkills: ["wit", "wit"] },
    },
  ])(
    "rejects invalid goals and unbounded or missing evidence",
    async (body) => {
      const { post, completeOnboarding } = setup();
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(completeOnboarding).not.toHaveBeenCalled();
    }
  );

  it("enforces origin and the 64 KiB completion body limit", async () => {
    const { post, completeOnboarding } = setup();
    const forbidden = await post(request, "https://other.example");
    const oversized = await post({ ...request, extra: "x".repeat(65_536) });
    expect(forbidden.status).toBe(403);
    expect(oversized.status).toBe(413);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns a recoverable failure without leaking provider details", async () => {
    const { post, completeOnboarding } = setup();
    completeOnboarding.mockRejectedValue(new Error("secret provider details"));
    const response = await post(request);
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain("secret");
  });

  it("accepts explicit skill choice without inventing a goal", async () => {
    const { post, completeOnboarding } = setup();
    completeOnboarding.mockResolvedValue(choose);
    const response = await post({ ...request, outcome: choose, messages: [] });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual(choose);
  });
});

describe("voice completion provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("selects benefits from the voice evidence without generating another text reply", async () => {
    const { ai, generate } = textClient();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const result = await createOnboardingProvider(
      ai,
      "test-key"
    ).completeOnboarding(request, new AbortController().signal);
    expect(result).toStrictEqual({
      ...request.outcome,
      benefits: { ids: defaultOnboardingBenefits, personalized: false },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(
      JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).state
    ).toStrictEqual({
      language: request.language,
      goal: request.outcome.goal,
      conversation: request.messages,
    });
  });

  it("does not reinterpret or rank an explicit skill choice", async () => {
    const { ai, generate } = textClient();
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const provider = createOnboardingProvider(ai, "test-key");
    const result = await provider.completeOnboarding(
      { ...request, outcome: choose, messages: [] },
      new AbortController().signal
    );
    expect(result).toStrictEqual(choose);
    const recommendations = await provider.recommendOnboarding(
      {
        name: "Alex",
        language: "English",
        motivation: "",
        goalStatus: "choose",
      },
      new AbortController().signal
    );
    expect(recommendations.suggestedSkills).toStrictEqual([]);
    expect(generate).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not commit a result after cancellation", async () => {
    const { ai } = textClient();
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(() => {
        controller.abort(new Error("Completion canceled"));
        return Promise.reject(new Error("canceled"));
      })
    );
    await expect(
      createOnboardingProvider(ai, "test-key").completeOnboarding(
        request,
        controller.signal
      )
    ).rejects.toThrow("Completion canceled");
  });
});

describe("production voice completion route", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["ranked", "unavailable"] as const)(
    "returns a validated completed goal when benefits are %s",
    async (benefitStatus) => {
      const fetcher = vi.fn<typeof fetch>();
      if (benefitStatus === "ranked") {
        fetcher.mockResolvedValue(
          Response.json({
            answers: Object.fromEntries(
              onboardingBenefitIds.map((id) => [
                id,
                { type: "score", score: 1 },
              ])
            ),
          })
        );
      } else {
        fetcher.mockRejectedValue(new Error("Benefit provider unavailable"));
      }
      vi.stubGlobal("fetch", fetcher);
      const provider = createGeminiProvider(
        "test-key",
        undefined,
        undefined,
        "test-benefits-key"
      );
      const app = createPracticeRoutes(provider, origin);
      const response = await app.request("/onboarding-completions", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual({
        ...request.outcome,
        benefits: {
          ids:
            benefitStatus === "ranked"
              ? onboardingBenefitIds.slice(0, 3)
              : defaultOnboardingBenefits,
          personalized: benefitStatus === "ranked",
        },
      });
      expect(fetcher).toHaveBeenCalledOnce();
      expect(fetcher.mock.calls[0]?.[0]).toBe(
        "https://api.typesafe.ai/v1/systemone"
      );
    }
  );
});

describe("completed onboarding state", () => {
  const profile = {
    version: 1,
    name: "Alex",
    language: "English",
    skills: ["listening"],
    motivation: "",
  };

  it("keeps legacy ready profiles and explicitly chosen empty goals valid", () => {
    expect(
      onboardingProfileSchema.safeParse({
        ...profile,
        motivation: "Meet people",
      }).success
    ).toBeTruthy();
    expect(
      onboardingProfileSchema.safeParse({ ...profile, goalStatus: "choose" })
        .success
    ).toBeTruthy();
    expect(onboardingProfileSchema.safeParse(profile).success).toBeFalsy();
    expect(
      onboardingProfileSchema.safeParse({ ...profile, goalStatus: "ready" })
        .success
    ).toBeFalsy();
  });

  it("persists completed voice outcomes and rejects unfinished clarification as completion", () => {
    const draft = {
      ...profile,
      step: "skills",
      conversationMode: "voice",
      goalStatus: "choose",
      resolvedGoal: { ...choose, reply: "Choose your skills." },
      conversation: Array.from({ length: 24 }, () => ({
        role: "user",
        text: "A message",
      })),
    };
    expect(onboardingDraftSchema.safeParse(draft).success).toBeTruthy();
    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        resolvedGoal: { ...draft.resolvedGoal, status: "clarify" },
      }).success
    ).toBeFalsy();
    expect(
      onboardingCompleteSchema.safeParse(request.outcome).success
    ).toBeTruthy();
    expect(
      onboardingVoiceCompletionRequestSchema.safeParse({
        ...request,
        messages: request.messages,
      }).success
    ).toBeTruthy();
  });
});
