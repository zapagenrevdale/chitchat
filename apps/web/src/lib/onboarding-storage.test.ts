import type { OnboardingProfile } from "@chitchat/contracts/onboarding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  freshOnboardingDraft,
  onboardingStorageKeys,
  readOnboarding,
  saveOnboardingDraft,
  saveOnboardingProfile,
} from "./onboarding-storage";

const profile: OnboardingProfile = {
  version: 1,
  name: "Alex",
  language: "Filipino",
  motivation: "Make friends.",
  skills: ["listening", "wit"],
};
describe("browser persistence", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  describe("onboarding persistence", () => {
    it("resumes later steps and saves completed profiles", () => {
      localStorage.setItem(
        onboardingStorageKeys.draft,
        JSON.stringify({
          ...freshOnboardingDraft(),
          ...profile,
          step: "benefits",
        })
      );
      expect(readOnboarding()).toStrictEqual({
        profile: null,
        draft: { ...freshOnboardingDraft(), ...profile, step: "benefits" },
      });
      expect(saveOnboardingProfile(profile)).toBeTruthy();
      expect(readOnboarding().profile).toStrictEqual(profile);
      expect(localStorage.getItem(onboardingStorageKeys.draft)).toBeNull();
    });

    it.each(["microphone", "motivation"] as const)(
      "discards an old %s conversation whose mode is unknown",
      (step) => {
        const draft = {
          ...freshOnboardingDraft(),
          ...profile,
          step,
          conversation: [{ role: "user" as const, text: "Old shared history" }],
        };
        saveOnboardingDraft(draft);
        expect(readOnboarding().draft).toMatchObject({
          ...draft,
          step: "microphone",
          motivation: "",
          conversation: [],
        });
      }
    );

    it("resumes an explicit text draft and its unfinished answer", () => {
      const draft = {
        ...freshOnboardingDraft(),
        ...profile,
        step: "motivation" as const,
        conversationMode: "text" as const,
        motivation: "My next answer",
        conversation: [
          { role: "user" as const, text: "Not sure" },
          { role: "assistant" as const, text: "When is speaking hardest?" },
        ],
      };
      saveOnboardingDraft(draft);
      expect(readOnboarding().draft).toStrictEqual(draft);
    });

    it("keeps voice selected but discards unfinished voice state for an explicit restart", () => {
      saveOnboardingDraft({
        ...freshOnboardingDraft(),
        ...profile,
        step: "microphone",
        conversationMode: "voice",
        conversation: [{ role: "user", text: "Old spoken goal" }],
      });
      expect(readOnboarding().draft).toMatchObject({
        name: profile.name,
        language: profile.language,
        skills: profile.skills,
        conversationMode: "voice",
        step: "microphone",
        conversation: [],
        motivation: "",
      });
    });

    it("preserves choosing skills without inventing a goal or redirecting on reload", () => {
      const chooseProfile = {
        ...profile,
        goalStatus: "choose" as const,
        motivation: "",
      };
      saveOnboardingDraft({ ...chooseProfile, step: "skills" });
      expect(readOnboarding().draft).toMatchObject({
        goalStatus: "choose",
        motivation: "",
        step: "skills",
      });
      expect(saveOnboardingProfile(chooseProfile)).toBeTruthy();
      expect(readOnboarding().profile).toStrictEqual(chooseProfile);
    });

    it("restores confirmed voice outcomes and their benefits", () => {
      const resolvedGoal = {
        status: "ready" as const,
        reply: "We can practice together.",
        goal: "Make friends.",
        suggestedSkills: ["listening" as const],
        benefits: {
          ids: [
            "start-conversations",
            "listen-and-connect",
            "keep-it-going",
          ] as ["start-conversations", "listen-and-connect", "keep-it-going"],
          personalized: true,
        },
      };
      saveOnboardingDraft({
        ...freshOnboardingDraft(),
        ...profile,
        conversationMode: "voice",
        goalStatus: "ready",
        step: "benefits",
        resolvedGoal,
        conversation: [{ role: "user", text: "Make friends" }],
      });
      expect(readOnboarding().draft).toMatchObject({
        step: "benefits",
        motivation: "Make friends.",
        resolvedGoal,
      });
    });

    it("rejects an empty completed goal without an explicit choose outcome", () => {
      expect(saveOnboardingProfile({ ...profile, motivation: "" })).toBeFalsy();
      expect(readOnboarding().profile).toBeNull();
    });

    it("ignores corrupt or unsupported data", () => {
      localStorage.setItem(
        onboardingStorageKeys.profile,
        JSON.stringify({ ...profile, skills: ["not-real"] })
      );
      localStorage.setItem(onboardingStorageKeys.draft, "not json");
      expect(readOnboarding()).toStrictEqual({
        profile: null,
        draft: freshOnboardingDraft(),
      });
    });

    it("handles blocked storage without preventing the current visit", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(readOnboarding().profile).toBeNull();
      expect(saveOnboardingProfile(profile)).toBeFalsy();
    });
  });
});

describe("skill catalog migration", () => {
  beforeEach(() => localStorage.clear());

  it("reopens affected completed profiles while keeping identity, goal and equivalent skills", () => {
    localStorage.setItem(
      onboardingStorageKeys.profile,
      JSON.stringify({
        ...profile,
        skills: ["smooth-speaking", "listening", "wit"],
      })
    );
    expect(readOnboarding()).toMatchObject({
      profile: null,
      draft: {
        name: profile.name,
        language: profile.language,
        motivation: profile.motivation,
        step: "skills",
        skills: ["listening", "wit"],
      },
    });
  });

  it("does not guess replacements when every old selection was removed", () => {
    localStorage.setItem(
      onboardingStorageKeys.profile,
      JSON.stringify({
        ...profile,
        skills: [
          "smooth-speaking",
          "thinking-on-your-feet",
          "situational-response",
        ],
      })
    );
    expect(readOnboarding().draft).toMatchObject({
      step: "skills",
      skills: [],
      motivation: profile.motivation,
    });
  });

  it.each(["listening", "smooth-speaking"])(
    "invalidates cached Gemini suggestions for %s and retains the full voice evidence",
    (skill) => {
      const conversation = Array.from({ length: 24 }, (_, index) => ({
        role: "user",
        text: `Goal detail ${index}`,
      }));
      localStorage.setItem(
        onboardingStorageKeys.draft,
        JSON.stringify({
          version: 1,
          name: "Alex",
          language: "English",
          motivation: "",
          step: "motivation",
          conversationMode: "voice",
          conversation,
          skills: [skill],
          resolvedGoal: {
            status: "ready",
            goal: "Share interests",
            reply: "Let's practice.",
            suggestedSkills: [skill],
          },
        })
      );
      expect(readOnboarding().draft).toMatchObject({
        name: "Alex",
        language: "English",
        motivation: "Share interests",
        goalStatus: "ready",
        step: "benefits",
        conversationMode: "voice",
        conversation,
        skillRecommendationsVersion: 2,
        skills: skill === "listening" ? ["listening"] : [],
      });
      expect(readOnboarding().draft.resolvedGoal).toBeUndefined();
    }
  );

  it("rejects unknown skill IDs rather than silently dropping arbitrary corrupted values", () => {
    localStorage.setItem(
      onboardingStorageKeys.draft,
      JSON.stringify({
        ...freshOnboardingDraft(),
        step: "skills",
        name: "Alex",
        motivation: "Meet people",
        skills: ["unknown"],
      })
    );
    expect(readOnboarding().draft).toStrictEqual(freshOnboardingDraft());
  });
});
