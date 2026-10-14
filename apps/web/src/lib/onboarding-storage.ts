import {
  conversationSkillSchema,
  selectedSkillsSchema,
} from "@chitchat/contracts/conversation-goals";
import {
  legacyOnboardingDraftSchema,
  legacyOnboardingProfileSchema,
  onboardingDraftSchema,
  onboardingProfileSchema,
  onboardingSteps,
} from "@chitchat/contracts/onboarding";
import type {
  OnboardingDraft,
  OnboardingProfile,
} from "@chitchat/contracts/onboarding";

export const onboardingStorageKeys = {
  profile: "chitchat.onboarding.profile.v1",
  draft: "chitchat.onboarding.draft.v1",
};

function retainedSkills(skills: string[]) {
  return selectedSkillsSchema.parse(
    skills.filter((skill) => conversationSkillSchema.safeParse(skill).success)
  );
}

function migrateDraft(value: unknown) {
  const current = onboardingDraftSchema.safeParse(value);
  const parsed = current.success
    ? current
    : legacyOnboardingDraftSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const saved = parsed.data;
  const skills = retainedSkills(saved.skills);
  if (saved.skillRecommendationsVersion === 2) {
    return onboardingDraftSchema.parse({ ...saved, skills });
  }
  const result = saved.resolvedGoal;
  let { step } = saved;
  if (result) {
    step =
      result.status === "choose" || saved.step === "skills"
        ? "skills"
        : "benefits";
  }
  return onboardingDraftSchema.parse({
    ...saved,
    skills,
    motivation: result?.goal ?? saved.motivation,
    goalStatus: result?.status ?? saved.goalStatus,
    step,
    resolvedGoal: undefined,
    skillRecommendationsVersion: 2,
  });
}

export function freshOnboardingDraft(): OnboardingDraft {
  return {
    version: 1,
    skillRecommendationsVersion: 2,
    step: "language",
    language: "English",
    name: "",
    motivation: "",
    skills: [],
  };
}

function restoreResolvedGoal(draft: OnboardingDraft): OnboardingDraft {
  const result = draft.resolvedGoal;
  if (!result || draft.step === "language" || draft.step === "name") {
    return draft;
  }
  return {
    ...draft,
    motivation: result.goal,
    goalStatus: result.status === "choose" ? "choose" : "ready",
    step:
      result.status === "choose" || draft.step === "skills"
        ? "skills"
        : "benefits",
  };
}

function restoreDraft(saved: OnboardingDraft) {
  let draft = { ...restoreResolvedGoal(saved) };
  const index = onboardingSteps.indexOf(draft.step);
  const conversationStep =
    draft.step === "microphone" || draft.step === "motivation";
  if (index > 1 && !draft.name.trim()) {
    draft = {
      ...draft,
      step: "name",
      conversation: [],
      motivation: "",
      conversationMode: undefined,
      goalStatus: undefined,
      resolvedGoal: undefined,
    };
  } else if (conversationStep && draft.conversationMode !== "text") {
    // Old histories have no trustworthy mode. Voice always starts afresh,
    // after the learner explicitly presses Answer/Restart voice.
    draft = {
      ...draft,
      step: "microphone",
      conversation: [],
      motivation: "",
      goalStatus: undefined,
      resolvedGoal: undefined,
    };
  } else if (conversationStep) {
    draft.step = "motivation";
    const messages = draft.conversation ?? [];
    const resumable =
      messages.length <= 6 &&
      messages.length % 2 === 0 &&
      messages.every(
        (message, position) =>
          message.role === (position % 2 === 0 ? "user" : "assistant")
      );
    if (!resumable) {
      draft.conversation = [];
    }
  } else if (index > 3) {
    if (draft.goalStatus === "choose") {
      draft.step = "skills";
      draft.motivation = "";
    } else if (!draft.motivation.trim()) {
      draft = {
        ...draft,
        step: "microphone",
        conversation: [],
        conversationMode: undefined,
        goalStatus: undefined,
        resolvedGoal: undefined,
      };
    }
  }
  return draft;
}

export function readOnboarding() {
  let profile: OnboardingProfile | null = null;
  let migratedProfile: OnboardingDraft | null = null;
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(onboardingStorageKeys.profile) ?? "null"
    );
    const parsed = onboardingProfileSchema.safeParse(value);
    if (parsed.success) {
      profile = parsed.data;
    } else {
      const legacy = legacyOnboardingProfileSchema.safeParse(value);
      if (legacy.success) {
        migratedProfile = {
          ...freshOnboardingDraft(),
          ...legacy.data,
          step: "skills",
          skills: retainedSkills(legacy.data.skills),
        };
      }
    }
  } catch {
    // Storage may be unavailable or contain data from an interrupted write.
  }
  let draft = migratedProfile ?? freshOnboardingDraft();
  try {
    const parsed = migrateDraft(
      JSON.parse(localStorage.getItem(onboardingStorageKeys.draft) ?? "null")
    );
    if (parsed) {
      draft = restoreDraft(parsed);
    }
  } catch {
    // Invalid drafts restart at language selection without breaking the page.
  }
  return { profile, draft };
}

export function saveOnboardingDraft(draft: OnboardingDraft) {
  try {
    localStorage.setItem(
      onboardingStorageKeys.draft,
      JSON.stringify(
        onboardingDraftSchema.parse({
          ...draft,
          skillRecommendationsVersion: 2,
        })
      )
    );
    return true;
  } catch {
    return false;
  }
}

export function saveOnboardingProfile(profile: OnboardingProfile) {
  try {
    localStorage.setItem(
      onboardingStorageKeys.profile,
      JSON.stringify(onboardingProfileSchema.parse(profile))
    );
    localStorage.removeItem(onboardingStorageKeys.draft);
    return true;
  } catch {
    return false;
  }
}
