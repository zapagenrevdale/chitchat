import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({ ...ultracite, ignorePatterns: ["**/routeTree.gen.ts", "**/generated/**", "**/public/decoders/draco/**", "bun.lock"] });
