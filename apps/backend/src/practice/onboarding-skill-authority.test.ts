import { conversationSkillIds } from "@chitchat/contracts/conversation-goals";
import {
  onboardingBenefitIds,
  defaultOnboardingBenefits,
} from "@chitchat/contracts/onboarding";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOnboardingProvider } from "./onboarding";
import {
  textClient,
  textResponse,
  textStreamResponse,
} from "./text-model.test-helper";

const conversation = [
  { role: "user" as const, text: "I want to listen." },
  { role: "assistant" as const, text: "And disagreements?" },
  { role: "user" as const, text: "No, sharing my interests is what I want." },
];
const goal = "Share interests";
describe("Jev skill authority", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["text", "voice", "restored"] as const)(
    "uses Jev for %s goals even if Gemini emits different skills",
    async (path) => {
      const { ai, stream, generate } = textClient();
      const gemini = {
        status: "ready",
        reply: "Let's practice sharing.",
        goal,
        suggestedSkills: ["wit"],
      };
      stream.mockResolvedValue(textStreamResponse(gemini));
      generate.mockResolvedValue(
        textResponse({ acknowledgment: gemini.reply, suggestedSkills: ["wit"] })
      );
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
        const body = JSON.parse(String(init?.body));
        const skills = Boolean(body.questions.sharing);
        return Promise.resolve(
          Response.json({
            answers: Object.fromEntries(
              (skills ? conversationSkillIds : onboardingBenefitIds).map(
                (id) => [
                  id,
                  {
                    type: "score",
                    score: skills ? Number(id === "sharing") * 3 : 1,
                  },
                ]
              )
            ),
          })
        );
      });
      vi.stubGlobal("fetch", fetcher);
      const provider = createOnboardingProvider(ai, "test-key");
      const identity = { name: "Alex", language: "English" as const };
      const { signal } = new AbortController();
      const paths = {
        text: () =>
          provider.onboardingTurn(
            { ...identity, messages: conversation },
            signal
          ),
        voice: () =>
          provider.completeOnboarding(
            {
              ...identity,
              outcome: { status: "ready", goal },
              messages: conversation,
            },
            signal
          ),
        restored: () =>
          provider.recommendOnboarding(
            { ...identity, motivation: goal, conversation },
            signal
          ),
      };
      const result = await paths[path]();
      expect(result.suggestedSkills).toStrictEqual(["sharing"]);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(
        fetcher.mock.calls.map(
          ([, init]) => JSON.parse(String(init?.body)).state.conversation
        )
      ).toStrictEqual([conversation, conversation]);
    }
  );

  it.each(["benefits", "skills"] as const)(
    "preserves the other result when %s fail",
    async (failed) => {
      const { ai } = textClient();
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockImplementation((_url, init) => {
          const body = JSON.parse(String(init?.body));
          const skills = Boolean(body.questions.sharing);
          if (skills === (failed === "skills")) {
            return Promise.reject(new Error("Offline"));
          }
          return Promise.resolve(
            Response.json({
              answers: Object.fromEntries(
                (skills ? conversationSkillIds : onboardingBenefitIds).map(
                  (id) => [
                    id,
                    {
                      type: "score",
                      score: skills ? Number(id === "sharing") * 3 : 1,
                    },
                  ]
                )
              ),
            })
          );
        })
      );
      const result = await createOnboardingProvider(
        ai,
        "test-key"
      ).completeOnboarding(
        {
          name: "Alex",
          language: "English",
          outcome: { status: "ready", goal },
          messages: conversation,
        },
        new AbortController().signal
      );
      expect(result.suggestedSkills).toStrictEqual(
        failed === "skills" ? [] : ["sharing"]
      );
      expect(result.benefits).toStrictEqual(
        failed === "benefits"
          ? { ids: defaultOnboardingBenefits, personalized: false }
          : { ids: onboardingBenefitIds.slice(0, 3), personalized: true }
      );
    }
  );
});
