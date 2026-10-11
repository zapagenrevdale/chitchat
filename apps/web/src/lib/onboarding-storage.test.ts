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
