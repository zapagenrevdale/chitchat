import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    "**/routeTree.gen.ts",
    "**/paraglide/**",
    "**/generated/**",
    "**/public/decoders/draco/**",
    "bun.lock",
  ],
});
