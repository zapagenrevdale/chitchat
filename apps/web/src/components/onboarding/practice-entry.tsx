import type { OnboardingProfile } from "@chitchat/contracts/onboarding";
import { useEffect, useState } from "react";

import { PracticeDesign } from "@/components/practice/practice-design";
import {
  freshOnboardingDraft,
  readOnboarding,
  saveOnboardingProfile,
} from "@/lib/onboarding-storage";

import { Onboarding } from "./onboarding";

export function PracticeEntry() {
  const [saved, setSaved] = useState<ReturnType<typeof readOnboarding> | null>(
    null
  );
  const [editing, setEditing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    // Browser storage is read after hydration so the server and first client render agree.
    // oxlint-disable-next-line react/set-state-in-effect
    setSaved(readOnboarding());
  }, []);

  function complete(profile: OnboardingProfile) {
    setSaveFailed(!saveOnboardingProfile(profile));
    setSaved({ profile, draft: freshOnboardingDraft() });
    setEditing(false);
  }
  if (!saved) {
    return (
      <main id="main" className="flex min-h-dvh items-center justify-center">
        <output className="text-muted-foreground">Getting ready…</output>
      </main>
    );
  }
  if (!saved.profile || editing) {
    return (
      <Onboarding
        initial={
          saved.profile ? { ...saved.profile, step: "skills" } : saved.draft
        }
        onComplete={complete}
        onCancel={saved.profile ? () => setEditing(false) : undefined}
      />
    );
  }
  const { profile } = saved;
  return (
    <>
      <PracticeDesign
        profile={saved.profile}
        onEditProfile={() => setEditing(true)}
        onLanguageChange={(language) => complete({ ...profile, language })}
      />
      {saveFailed && (
        <output className="text-muted-foreground px-4 pb-4 text-center text-sm">
          Your preferences are available for this visit, but couldn’t be saved
          on this browser.
        </output>
      )}
    </>
  );
}
