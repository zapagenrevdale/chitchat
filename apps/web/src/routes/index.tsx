import { createFileRoute } from "@tanstack/react-router";

import { PracticeEntry } from "@/components/onboarding/practice-entry";
import { siteUrl } from "@/lib/env";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Practice studio — Chitchat" }],
    links: [{ rel: "canonical", href: siteUrl }],
  }),
  component: PracticeEntry,
});
