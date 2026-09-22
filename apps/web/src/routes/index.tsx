import { createFileRoute } from "@tanstack/react-router";

import { PracticeDesign } from "@/components/practice/practice-design";
import { siteUrl } from "@/lib/env";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Practice studio — Chitchat" }],
    links: [{ rel: "canonical", href: siteUrl }],
  }),
  component: PracticeDesign,
});
