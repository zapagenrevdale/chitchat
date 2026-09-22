import { existsSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

import {
  checkDatabase,
  dockerId,
  removeDatabase,
  resourceIds,
  startDatabase,
} from "./database";
import { runningServices, stopServices } from "./development";
import {
  assertEnvironment,
  checkEnvironmentOverrides,
  configureEnvironment,
  restoreEnvironment,
  serviceEnvironment,
} from "./environment";
import {
  assertProxy,
  colorOccupied,
  discoverUrls,
  prepareProxy,
  proxyDirectory,
} from "./proxy";
import type { Registry } from "./registry";
import { capture, readText, run } from "./runtime";
import {
  loadState,
  projectName,
  requireReady,
  requireState,
  saveState,
} from "./state";
import type { State } from "./state";

interface SetupOptions {
  color?: string;
  copySecretsFrom?: string;
}

const { join } = path;

function preflight(root: string) {
  const manifest = JSON.parse(readText(join(root, "package.json")) ?? "{}");
  const expectedBun = String(manifest.packageManager).replace("bun@", "");
  const actualBun = capture("bun", ["--version"], root);
  if (actualBun !== expectedBun) {
    throw new Error(
      `This workspace requires Bun ${expectedBun}; found ${actualBun}.`
    );
  }
  const node = capture("node", ["--version"], root);
  if (Number(node.replace(/^v/u, "").split(".")[0]) < 24) {
    throw new Error(`Portless requires Node.js 24+; found ${node}.`);
  }
  capture("docker", ["compose", "version"], root);
  return dockerId(root);
}

export async function setup(
  root: string,
  registry: Registry,
  options: SetupOptions
) {
  return await registry.exclusive(root, async () => {
    const existing = loadState(root);
    if (existing?.phase === "deleting") {
      throw new Error(
        "Teardown is incomplete. Rerun worktree:teardown before setup."
      );
    }
    if (existing && runningServices(existing).length > 0) {
      throw new Error("Stop bun run dev before rerunning setup.");
    }
    checkEnvironmentOverrides(root);
    const daemon = preflight(root);
    const source = options.copySecretsFrom
      ? realpathSync(path.resolve(root, options.copySecretsFrom))
      : undefined;
    if (source && !existsSync(join(source, "apps/backend/.env"))) {
      throw new Error(`No apps/backend/.env found in ${source}.`);
    }
    await prepareProxy(root);
    const reservation = registry.reserve(root, options.color, colorOccupied);
    const state: State = existing ?? {
      version: 1,
      ...reservation,
      registryDirectory: registry.directory,
      phase: "provisioning",
      dockerId: daemon,
      proxyDirectory: proxyDirectory(),
      urls: discoverUrls(root, reservation.color),
      databasePort: null,
    };
    registry.assertOwner(state);
    state.phase = "provisioning";
    state.urls = discoverUrls(root, state.color);
    state.proxyDirectory = proxyDirectory();
    saveState(state);
    await run("bun", ["install", "--frozen-lockfile"], root);
    state.databasePort = await startDatabase(state);
    saveState(state);
    configureEnvironment(state, source);
    const env = serviceEnvironment(state, "packages/db");
    await run("bun", ["run", "db:generate"], root, env);
    await run("bun", ["run", "db:deploy"], root, env);
    await checkDatabase(state);
    state.phase = "ready";
    saveState(state);
    return state;
  });
}

export async function teardown(root: string, registry: Registry) {
  await registry.exclusive(root, async () => {
    const state = loadState(root);
    if (!state) {
      const reservation = registry.list().find((entry) => entry.root === root);
      if (reservation) {
        const resources = resourceIds(root, projectName(reservation));
        if (Object.values(resources).some((ids) => ids.length > 0)) {
          throw new Error(
            "A reservation has Docker resources but no local manifest. Restore .worktree/state.json before teardown."
          );
        }
        registry.release(reservation);
      }
      return;
    }
    registry.assertOwner(state);
    state.phase = "deleting";
    saveState(state);
    await stopServices(state);
    await removeDatabase(state);
    restoreEnvironment(state);
    rmSync(join(root, ".worktree"), { recursive: true, force: true });
    registry.release(state);
  });
}

export function status(root: string, registry: Registry) {
  const state = loadState(root);
  let database: unknown = null;
  let databaseError: string | null = null;
  if (state) {
    try {
      if (dockerId(root) !== state.dockerId) {
        throw new Error("Docker daemon differs from setup.");
      }
      const ids = resourceIds(root, projectName(state));
      database = {
        project: projectName(state),
        host: "127.0.0.1",
        port: state.databasePort,
        name: "chitchat",
        ...ids,
        running: ids.containers.map((id) =>
          JSON.parse(
            capture(
              "docker",
              ["inspect", "--format", "{{json .State}}", id],
              root
            )
          )
        ),
      };
    } catch (error) {
      databaseError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    configured: Boolean(state),
    root,
    id: state?.id ?? null,
    color: state?.color ?? null,
    phase: state?.phase ?? null,
    urls: state?.urls ?? null,
    runningServices: state ? runningServices(state) : [],
    database,
    databaseError,
    reservations: registry.list().map((entry) => ({
      ...entry,
      project: projectName(entry),
      orphaned: !existsSync(entry.root),
      manifestMissing: !existsSync(join(entry.root, ".worktree", "state.json")),
    })),
  };
}

export async function smoke(root: string, registry: Registry) {
  await registry.exclusive(root, async () => {
    const state = requireState(root);
    registry.assertOwner(state);
    requireReady(state);
    assertEnvironment(state);
    assertProxy(state);
    await checkDatabase(state);
    const ca = readText(join(state.proxyDirectory, "ca.pem"));
    const request = async (url: string, headers?: Record<string, string>) => {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30_000),
        ...(ca ? { tls: { ca } } : {}),
      });
      if (!response.ok) {
        throw new Error(
          `${url} returned HTTP ${response.status}. Start bun run dev before worktree:check.`
        );
      }
      return response;
    };
    const [web, health, scenarios, email] = await Promise.all([
      request(state.urls.web),
      request(`${state.urls.backend}/health`),
      request(`${state.urls.backend}/api/scenarios`, {
        Origin: state.urls.web,
      }),
      request(state.urls.email),
    ]);
    const healthBody = await health.json();
    if (healthBody.status !== "ok" || healthBody.service !== "chitchat-api") {
      throw new Error("API health response does not match Chitchat.");
    }
    if (
      scenarios.headers.get("access-control-allow-origin") !== state.urls.web ||
      scenarios.headers.get("access-control-allow-credentials") !== "true"
    ) {
      throw new Error(
        "API CORS configuration does not match the worktree web origin."
      );
    }
    const webHtml = await web.text();
    if (
      !webHtml.toLowerCase().includes("chitchat") ||
      !email.headers.get("content-type")?.includes("text/html")
    ) {
      throw new Error("Web or email preview returned an unexpected page.");
    }
    console.log(
      `Smoke checks passed for ${state.color}: database schema, web, API health, CORS, email preview.`
    );
  });
}
