/* oxlint-disable vitest/prefer-importing-vitest-globals -- Bun's native runner supports the SQLite-based tooling. */
import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parse } from "dotenv";

import {
  assertEnvironment,
  configureEnvironment,
  restoreEnvironment,
} from "./environment";
import { Registry } from "./registry";
import { readText, writePrivate } from "./runtime";
import { loadState, saveState } from "./state";
import type { State } from "./state";

const directories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "cc-worktree-test-"));
  directories.push(directory);
  return directory;
}

function fixture(): State {
  const root = temporaryDirectory();
  for (const directory of ["apps/backend", "apps/web", "packages/db"]) {
    writePrivate(
      path.join(root, directory, ".env.example"),
      "# Test environment\n"
    );
  }
  return {
    version: 1,
    id: crypto.randomUUID(),
    root,
    registryDirectory: path.join(root, "registry"),
    color: "coral",
    createdAt: new Date().toISOString(),
    phase: "ready",
    dockerId: "test-daemon",
    proxyDirectory: path.join(root, "proxy"),
    databasePort: 55_555,
    urls: {
      web: "https://coral.cc.local",
      backend: "https://api.coral.cc.local",
      email: "https://email.coral.cc.local",
    },
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("worktree ownership", () => {
  test("concurrent agents reserve different colors and keep stopped worktrees reserved", async () => {
    const directory = temporaryDirectory();
    const registry = new Registry(directory);
    const script = `
      import { Registry } from ${JSON.stringify(import.meta.resolve("./registry.ts"))};
      const registry = new Registry(process.argv[1]);
      console.log(JSON.stringify(registry.reserve(process.argv[2], undefined, () => false)));
      registry.close();
    `;
    try {
      const children = ["one", "two", "three", "four"].map((name) =>
        Bun.spawn(
          [
            process.execPath,
            "-e",
            script,
            directory,
            path.join(directory, name),
          ],
          { stdout: "pipe", stderr: "pipe" }
        )
      );
      const results = await Promise.all(
        children.map(async (child) => ({
          code: await child.exited,
          output: await new Response(child.stdout).text(),
          error: await new Response(child.stderr).text(),
        }))
      );
      expect(results.map((result) => result.error)).toEqual(["", "", "", ""]);
      expect(results.map((result) => result.code)).toEqual([0, 0, 0, 0]);
      const reserved = registry.list();
      expect(new Set(reserved.map((entry) => entry.color)).size).toBe(4);
      expect(
        registry.reserve(reserved[0].root, undefined, () => false)
      ).toEqual(reserved[0]);
      expect(() =>
        registry.reserve("another", reserved[0].color, () => false)
      ).toThrow("already reserved");
      registry.release(reserved[0]);
      expect(
        registry.reserve("another", reserved[0].color, () => false).color
      ).toBe(reserved[0].color);
    } finally {
      registry.close();
    }
  });

  test("recovers a lease left by a crashed agent", async () => {
    const directory = temporaryDirectory();
    const registry = new Registry(directory);
    const script = `
      import { Registry } from ${JSON.stringify(import.meta.resolve("./registry.ts"))};
      const registry = new Registry(process.argv[1]);
      await registry.exclusive("checkout", async () => { process.exit(9); });
    `;
    try {
      const child = Bun.spawn([process.execPath, "-e", script, directory], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await child.exited).toBe(9);
      expect(
        await registry.exclusive("checkout", () => Promise.resolve("recovered"))
      ).toBe("recovered");
    } finally {
      registry.close();
    }
  });

  test("rejects routes already occupied outside the registry and mismatched cleanup owners", () => {
    const registry = new Registry(temporaryDirectory());
    try {
      expect(() => registry.reserve("one", "coral", () => true)).toThrow(
        "active Portless route"
      );
      const owner = registry.reserve("one", "coral", () => false);
      expect(() => registry.release({ ...owner, root: "two" })).toThrow(
        "identity"
      );
      expect(registry.list()).toHaveLength(1);
    } finally {
      registry.close();
    }
  });

  test("rejects a manifest copied from another worktree", () => {
    const state = fixture();
    saveState(state);
    const other = temporaryDirectory();
    writePrivate(
      path.join(other, ".worktree", "state.json"),
      JSON.stringify(state)
    );
    expect(() => loadState(other)).toThrow("another checkout");
  });

  test("relative cleanup targets resolve from the invoking checkout root", () => {
    const directory = temporaryDirectory();
    for (const name of ["main", "feature"]) {
      writePrivate(
        path.join(directory, name, "package.json"),
        '{"name":"chitchat"}'
      );
      writePrivate(path.join(directory, name, "turbo.json"), "{}");
    }
    const cwd = path.join(directory, "main", "packages", "worktree");
    writePrivate(
      path.join(cwd, "package.json"),
      '{"name":"@chitchat/worktree"}'
    );
    const script = `
      import { targetWorkspace } from ${JSON.stringify(import.meta.resolve("./runtime.ts"))};
      console.log(targetWorkspace(process.argv[1]));
    `;
    const target = Bun.spawnSync(
      [process.execPath, "-e", script, "../feature"],
      { cwd }
    );
    expect(target.exitCode).toBe(0);
    expect(target.stdout.toString().trim()).toBe(
      realpathSync(path.join(directory, "feature"))
    );
    const nested = Bun.spawnSync(
      [process.execPath, "-e", script, "packages/worktree"],
      { cwd }
    );
    expect(nested.exitCode).not.toBe(0);
    expect(nested.stderr.toString()).toContain("root of a Chitchat checkout");
  });
});

describe("worktree environments", () => {
  test("setup is repeatable, keeps auth secrets stable, and restores pre-existing files", () => {
    const state = fixture();
    const file = path.join(state.root, "apps/backend/.env");
    const original =
      "# Existing configuration\nGEMINI_API_KEY=local-test-key\n";
    writePrivate(file, original);
    configureEnvironment(state);
    const first = readText(file);
    configureEnvironment(state);
    expect(readText(file)).toBe(first);
    assertEnvironment(state);
    expect(parse(first ?? "").BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(
      32
    );
    restoreEnvironment(state);
    restoreEnvironment(state);
    expect(readText(file)).toBe(original);
    expect(existsSync(path.join(state.root, "apps/web/.env"))).toBe(false);
  });

  test("preserves later user edits when restoring the original environment", () => {
    const state = fixture();
    configureEnvironment(state);
    const directory = path.join(state.root, "apps/backend");
    const file = path.join(directory, ".env");
    const edited = `${readText(file)}CUSTOM_SETTING=keep-me\n`;
    writePrivate(file, edited);
    restoreEnvironment(state);
    const backups = readdirSync(directory).filter((name) =>
      name.endsWith(".bak")
    );
    expect(backups).toHaveLength(1);
    expect(readText(path.join(directory, backups[0]))).toBe(edited);
    expect(existsSync(file)).toBe(false);
  });

  test("copies only opted-in backend integration settings and generates independent auth secrets", () => {
    const state = fixture();
    const source = temporaryDirectory();
    writePrivate(
      path.join(source, "apps/backend/.env"),
      "GEMINI_API_KEY=source-test-key\nBETTER_AUTH_SECRET=source-secret\nDATABASE_URL=source-database\n"
    );
    configureEnvironment(state);
    const file = path.join(state.root, "apps/backend/.env");
    expect(parse(readText(file) ?? "").GEMINI_API_KEY).toBeUndefined();
    configureEnvironment(state, source);
    const backend = parse(readText(file) ?? "");
    expect(backend.GEMINI_API_KEY).toBe("source-test-key");
    expect(backend.BETTER_AUTH_SECRET).not.toBe("source-secret");
    expect(backend.DATABASE_URL).toContain(":55555/chitchat");
    expect(readText(path.join(state.root, "apps/web/.env"))).not.toContain(
      "source-test-key"
    );
  });
});
