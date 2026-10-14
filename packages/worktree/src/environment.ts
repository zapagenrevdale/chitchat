import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import nodePath from "node:path";

import { parse } from "dotenv";
import { z } from "zod";

import { readText, writeJson, writePrivate } from "./runtime";
import { databaseUrl } from "./state";
import type { State } from "./state";

const { join } = nodePath;

const environmentFiles = [
  "apps/backend/.env",
  "apps/web/.env",
  "packages/db/.env",
];
const backupSchema = z.object({
  original: z.string().nullable(),
  written: z.string().nullable(),
});

export function updateEnvironment(
  text: string,
  values: Record<string, string>
) {
  const remaining = new Map(Object.entries(values));
  const lines = text
    .trimEnd()
    .split(/\r?\n/u)
    .flatMap((line) => {
      const key = /^\s*(?:export\s+)?(?<key>[A-Z][A-Z0-9_]*)\s*=/u.exec(line)
        ?.groups?.key;
      if (!key || !(key in values)) {
        return [line];
      }
      if (!remaining.has(key)) {
        return [];
      }
      remaining.delete(key);
      return [`${key}=${JSON.stringify(values[key])}`];
    });
  for (const [key, value] of remaining) {
    lines.push(`${key}=${JSON.stringify(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

function backupPath(state: State, file: string) {
  return join(
    state.root,
    ".worktree",
    "environment",
    `${file.replaceAll("/", "_")}.json`
  );
}

function preserveEdits(state: State, file: string, contents: string) {
  const path = join(
    state.root,
    `${file}.worktree-${state.id}-${crypto.randomUUID()}.bak`
  );
  writePrivate(path, contents);
  console.error(`Preserved edited environment file: ${path}`);
}

export function checkEnvironmentOverrides(root: string) {
  for (const directory of ["apps/backend", "apps/web", "packages/db"]) {
    for (const suffix of [
      ".env.local",
      ".env.development",
      ".env.development.local",
      ".env.production",
      ".env.production.local",
      ".env.test",
      ".env.test.local",
    ]) {
      if (existsSync(join(root, directory, suffix))) {
        throw new Error(
          `${directory}/${suffix} can override the worktree configuration. Move its settings into ${directory}/.env before setup.`
        );
      }
    }
  }
}

function managedEnvironment(state: State) {
  return {
    "apps/backend/.env": {
      WEB_ORIGIN: state.urls.web,
      BETTER_AUTH_URL: state.urls.backend,
      DATABASE_URL: databaseUrl(state),
    },
    "apps/web/.env": {
      VITE_API_URL: state.urls.backend,
      VITE_SITE_URL: state.urls.web,
    },
    "packages/db/.env": { DATABASE_URL: databaseUrl(state) },
  };
}

export function configureEnvironment(state: State, secretsFrom?: string) {
  const currentBackend = parse(
    readText(join(state.root, "apps/backend/.env")) ?? ""
  );
  const savedBackend = readText(backupPath(state, "apps/backend/.env"));
  const priorBackend = savedBackend
    ? backupSchema.parse(JSON.parse(savedBackend)).written
    : null;
  const authSecret = priorBackend
    ? parse(priorBackend).BETTER_AUTH_SECRET
    : randomBytes(48).toString("base64");
  const managed = managedEnvironment(state);
  const backend: Record<string, string> = {
    ...managed["apps/backend/.env"],
    BETTER_AUTH_SECRET: authSecret,
  };
  if (secretsFrom) {
    const source = readText(join(secretsFrom, "apps/backend/.env"));
    if (source === null) {
      throw new Error(`No apps/backend/.env found in ${secretsFrom}.`);
    }
    const values = parse(source);
    for (const key of ["GEMINI_API_KEY", "GEMINI_API_KEY_LIVE"]) {
      if (values[key] && !currentBackend[key]) {
        backend[key] = values[key];
      }
    }
  }
  const overrides: Record<string, Record<string, string>> = {
    ...managed,
    "apps/backend/.env": backend,
  };
  for (const file of environmentFiles) {
    const current = readText(join(state.root, file));
    const backupText = readText(backupPath(state, file));
    const backup = backupText
      ? backupSchema.parse(JSON.parse(backupText))
      : { original: current, written: null };
    if (
      backup.written !== null &&
      current !== null &&
      current !== backup.written &&
      current !== backup.original
    ) {
      preserveEdits(state, file, current);
    }
    const base = current ?? readText(join(state.root, `${file}.example`)) ?? "";
    backup.written = updateEnvironment(base, overrides[file]);
    // Journal before replacing the file, so teardown can recover an interrupted write.
    writeJson(backupPath(state, file), backup);
    writePrivate(join(state.root, file), backup.written);
  }
}

export function restoreEnvironment(state: State) {
  for (const file of environmentFiles) {
    const backupText = readText(backupPath(state, file));
    if (!backupText) {
      continue;
    }
    const backup = backupSchema.parse(JSON.parse(backupText));
    const current = readText(join(state.root, file));
    if (
      current !== null &&
      current !== backup.written &&
      current !== backup.original
    ) {
      preserveEdits(state, file, current);
    }
    if (backup.original === null) {
      rmSync(join(state.root, file), { force: true });
    } else {
      writePrivate(join(state.root, file), backup.original);
    }
  }
}

export function serviceEnvironment(state: State, directory: string) {
  return {
    ...process.env,
    ...parse(readText(join(state.root, directory, ".env")) ?? ""),
  };
}

export function assertEnvironment(state: State) {
  checkEnvironmentOverrides(state.root);
  const managed = managedEnvironment(state);
  const backend = managed["apps/backend/.env"];
  const expected: Record<string, Record<string, string>> = {
    "apps/backend/.env": {
      DATABASE_URL: backend.DATABASE_URL,
      WEB_ORIGIN: backend.WEB_ORIGIN,
      BETTER_AUTH_URL: backend.BETTER_AUTH_URL,
    },
    "apps/web/.env": managed["apps/web/.env"],
    "packages/db/.env": managed["packages/db/.env"],
  };
  for (const [file, values] of Object.entries(expected)) {
    const actual = parse(readText(join(state.root, file)) ?? "");
    for (const [key, value] of Object.entries(values)) {
      if (actual[key] !== value) {
        throw new Error(
          `${file}: ${key} no longer matches this worktree. Rerun worktree:setup.`
        );
      }
    }
  }
}
