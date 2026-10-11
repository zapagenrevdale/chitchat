import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, react, tanstack, vitest],
  rules: {
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "react/function-component-definition": [
      "error",
      {
        namedComponents: "function-declaration",
        unnamedComponents: "arrow-function",
      },
    ],
  },
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/routeTree.gen.ts",
    "**/paraglide/**",
    "**/generated/**",
    "**/components/ui/**",
    "**/public/decoders/draco/**",
  ],
});
