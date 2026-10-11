import { createContext, useContext } from "react";

import { m } from "@/paraglide/messages";
import type { Locale } from "@/paraglide/runtime";

// The selected practice language owns this subtree. Explicit locales avoid a
// global locale mutation, page reload, or cross-request state during SSR.
export const OnboardingLocaleContext = createContext<Locale>("en");

export function useOnboardingLocale() {
  return useContext(OnboardingLocaleContext);
}

export function languageName(locale: Locale) {
  return (
    new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale
  );
}

export function onboardingSpeechOptions(locale: Locale) {
  return {
    language: locale,
    errorMessages: {
      unsupported: m.speech_unsupported({}, { locale }),
      denied: m.speech_denied({}, { locale }),
      service: m.speech_service({}, { locale }),
      microphone: m.speech_microphone({}, { locale }),
      noSpeech: m.speech_no_speech({}, { locale }),
      network: m.speech_network({}, { locale }),
      stopped: m.speech_stopped({}, { locale }),
      start: m.speech_start({}, { locale }),
    },
  };
}
