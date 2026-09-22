import path from "node:path";

import { z } from "zod";

import { readText, writeJson } from "./runtime";

const { join } = path;

export const services = {
  web: { directory: "apps/web", prefix: "" },
  backend: { directory: "apps/backend", prefix: "api." },
  email: { directory: "packages/email", prefix: "email." },
} as const;

export type Service = keyof typeof services;

const stateSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  root: z.string(),
  registryDirectory: z.string(),
  color: z.string().regex(/^[a-z]+$/u),
  createdAt: z.iso.datetime(),
  phase: z.enum(["provisioning", "ready", "deleting"]),
  dockerId: z.string().min(1),
  proxyDirectory: z.string(),
  urls: z.object({ web: z.url(), backend: z.url(), email: z.url() }),
  databasePort: z.number().int().min(1).max(65_535).nullable(),
});

export type State = z.infer<typeof stateSchema>;

export function statePath(root: string) {
  return join(root, ".worktree", "state.json");
}

export function loadState(root: string): State | null {
  const text = readText(statePath(root));
  if (!text) {
    return null;
  }
  const state = stateSchema.parse(JSON.parse(text));
  if (state.root !== root) {
    throw new Error(
      "This .worktree directory belongs to another checkout. Do not copy .worktree between worktrees."
    );
  }
  return state;
}

export function requireState(root: string) {
  const state = loadState(root);
  if (!state) {
    throw new Error(
      "This checkout is not configured. Run bun run worktree:setup first."
    );
  }
  return state;
}

export function saveState(state: State) {
  writeJson(statePath(state.root), stateSchema.parse(state));
}

export function projectName(state: Pick<State, "id">) {
  return `cc-wt-${state.id}`;
}

export function databaseUrl(state: State) {
  if (!state.databasePort) {
    throw new Error(
      "Database provisioning is incomplete. Rerun bun run worktree:setup."
    );
  }
  return `postgresql://postgres:postgres@127.0.0.1:${state.databasePort}/chitchat`;
}

export function requireReady(state: State) {
  if (state.phase !== "ready") {
    throw new Error(
      `Worktree is ${state.phase}. Run worktree:${state.phase === "deleting" ? "teardown" : "setup"} to finish.`
    );
  }
}
