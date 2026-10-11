import {
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

export function freshOnboardingDraft(): OnboardingDraft {
  return {
    version: 1,
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
    if (!draft.conversationMode && draft.conversation) {
      draft.conversation = [];
    }
  }
  return draft;
}

export function readOnboarding() {
  let profile: OnboardingProfile | null = null;
  try {
    const parsed = onboardingProfileSchema.safeParse(
      JSON.parse(localStorage.getItem(onboardingStorageKeys.profile) ?? "null")
    );
    if (parsed.success) {
      profile = parsed.data;
    }
  } catch {
    // Storage may be unavailable or contain data from an interrupted write.
  }
  let draft = freshOnboardingDraft();
  try {
    const parsed = onboardingDraftSchema.safeParse(
      JSON.parse(localStorage.getItem(onboardingStorageKeys.draft) ?? "null")
    );
    if (parsed.success) {
      draft = restoreDraft(parsed.data);
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
      JSON.stringify(onboardingDraftSchema.parse(draft))
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
