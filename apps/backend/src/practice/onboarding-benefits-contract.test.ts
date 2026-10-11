import { onboardingBenefitsSchema } from "@chitchat/contracts/onboarding";
import { describe, expect, it } from "vitest";

describe("onboarding benefit response", () => {
  it.each([
    [],
    ["start-conversations", "keep-it-going"],
    [
      "start-conversations",
      "keep-it-going",
      "tell-stories",
      "express-yourself",
    ],
    ["start-conversations", "start-conversations", "keep-it-going"],
    ["start-conversations", "keep-it-going", "invented-benefit"],
  ])(
    "rejects cards outside the three distinct known IDs contract: %j",
    (...ids) => {
      expect(
        onboardingBenefitsSchema.safeParse({ ids, personalized: true }).success
      ).toBeFalsy();
    }
  );
});
