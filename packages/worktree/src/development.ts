import { existsSync, lstatSync, rmSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import { assertEnvironment, serviceEnvironment } from "./environment";
import { assertProxy, portlessCommand, routeStore, serviceName } from "./proxy";
import { Registry } from "./registry";
import {
  developmentPort,
  processIdentity,
  readText,
  run,
  writeJson,
} from "./runtime";
import { loadState, requireReady, services } from "./state";
import type { Service, State } from "./state";

const { join } = path;

const processSchema = z.object({
  pid: z.number().int().positive(),
  identity: z.string(),
  id: z.uuid(),
});

function processPath(state: State, service: Service) {
  return join(state.root, ".worktree", "processes", `${service}.json`);
}

function processRecord(state: State, service: Service) {
  const text = readText(processPath(state, service));
  if (!text) {
    return null;
  }
  const record = processSchema.parse(JSON.parse(text));
  if (record.id !== state.id) {
    throw new Error(`Saved ${service} process belongs to another worktree.`);
  }
  return record;
}

export function runningServices(state: State) {
  return Object.keys(services).filter((service) => {
    const record = processRecord(state, service as Service);
    return record && processIdentity(record.pid) === record.identity;
  });
}

export async function stopServices(state: State) {
  const store = routeStore(state.proxyDirectory);
  for (const service of Object.keys(services) as Service[]) {
    const record = processRecord(state, service);
    const name = serviceName(state.color, service);
    const routes = store
      .loadRoutesRaw()
      .filter((route) => route.hostname.startsWith(`${name}.`));
    if (!record) {
      if (routes.length > 0) {
        throw new Error(
          `Route ${name} has no saved process owner. Stop its dev server before retrying teardown.`
        );
      }
      continue;
    }
    const identity = processIdentity(record.pid);
    if (
      identity &&
      identity !== record.identity &&
      routes.some((route) => route.pid === record.pid)
    ) {
      throw new Error(
        `PID ${record.pid} has been reused. Cannot verify ownership of ${name}.`
      );
    }
    if (identity === record.identity) {
      process.kill(record.pid, "SIGTERM");
      const deadline = Date.now() + 15_000;
      while (processIdentity(record.pid) === record.identity) {
        if (Date.now() > deadline) {
          throw new Error(
            `${service} did not stop. Stop its dev process and retry teardown.`
          );
        }
        // Shutdown must finish before its route and database can be removed.
        // oxlint-disable-next-line no-await-in-loop
        await delay(100);
      }
    }
    for (const route of routes) {
      if (route.pid !== record.pid) {
        throw new Error(`Route ${route.hostname} is owned by another process.`);
      }
      store.removeRoute(route.hostname, record.pid);
    }
    rmSync(processPath(state, service), { force: true });
  }
}

export async function develop(root: string, service: Service) {
  const directory = join(root, services[service].directory);
  const state = loadState(root);
  if (!state) {
    const git = join(root, ".git");
    if (existsSync(git) && lstatSync(git).isFile()) {
      throw new Error(
        "This linked worktree needs bun run worktree:setup before bun run dev."
      );
    }
    await run("node", portlessCommand([]), directory);
    return;
  }
  const registry = new Registry(state.registryDirectory);
  let exited: Promise<number | null> | undefined;
  try {
    await registry.exclusive(root, async () => {
      const current = loadState(root);
      if (!current || current.id !== state.id) {
        throw new Error(
          "Worktree was removed while starting development. Rerun setup."
        );
      }
      registry.assertOwner(current);
      requireReady(current);
      assertEnvironment(current);
      assertProxy(current);
      if (runningServices(current).includes(service)) {
        throw new Error(`${service} is already running in this worktree.`);
      }
      const port = await developmentPort();
      const child = Bun.spawn(
        [
          "node",
          ...portlessCommand([
            serviceName(current.color, service),
            "--app-port",
            String(port),
            "bun",
            "run",
            "dev:app",
          ]),
        ],
        {
          cwd: directory,
          env: serviceEnvironment(current, services[service].directory),
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }
      );
      ({ exited } = child);
      const identity = child.pid ? processIdentity(child.pid) : null;
      if (!child.pid || !identity) {
        child.kill("SIGTERM");
        await exited;
        throw new Error(`Could not start ${service}.`);
      }
      writeJson(processPath(current, service), {
        pid: child.pid,
        identity,
        id: current.id,
      });
    });
  } finally {
    registry.close();
  }
  const code = await exited;
  if (code !== undefined && code !== null && ![0, 130, 143].includes(code)) {
    throw new Error(`${service} exited with code ${code}.`);
  }
}
