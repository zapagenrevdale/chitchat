import { createFileRoute } from "@tanstack/react-router";

import { ThemeGallery } from "@/components/theme/theme-gallery";

export const Route = createFileRoute("/theme")({
  head: () => ({
    meta: [
      { title: "Theme — Chitchat" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThemeGallery,
});
