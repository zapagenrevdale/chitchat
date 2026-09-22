import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveUserHome, RouteStore } from "portless";

import { capture, run } from "./runtime";
import { services } from "./state";
import type { Service, State } from "./state";

const { dirname, join, resolve } = path;

const portlessCli = join(
  dirname(fileURLToPath(import.meta.resolve("portless"))),
  "cli.js"
);

export function proxyDirectory() {
  return resolve(
    process.env.PORTLESS_STATE_DIR ?? join(resolveUserHome(), ".portless")
  );
}

export function portlessCommand(args: string[]) {
  return [portlessCli, ...args];
}

export function routeStore(directory = proxyDirectory()) {
  return new RouteStore(directory);
}

export async function prepareProxy(root: string) {
  if (["0", "false", "skip"].includes(process.env.PORTLESS ?? "")) {
    throw new Error(
      "Worktree development requires Portless. Unset PORTLESS before setup."
    );
  }
  await run("node", portlessCommand(["proxy", "start"]), root);
  await run("node", portlessCommand(["doctor"]), root);
}

export function serviceName(color: string, service: Service) {
  return `${services[service].prefix}${color}.cc`;
}

export function discoverUrls(root: string, color: string) {
  const url = (service: Service) =>
    new URL(
      capture(
        "node",
        portlessCommand(["get", serviceName(color, service), "--no-worktree"]),
        root
      )
    ).origin;
  return { web: url("web"), backend: url("backend"), email: url("email") };
}

export function colorOccupied(color: string) {
  const names = Object.keys(services).map((service) =>
    serviceName(color, service as Service)
  );
  return routeStore()
    .loadRoutes()
    .some((route) =>
      names.some((name) => route.hostname.startsWith(`${name}.`))
    );
}

export function assertProxy(state: State) {
  if (proxyDirectory() !== state.proxyDirectory) {
    throw new Error(
      "PORTLESS_STATE_DIR differs from setup. Restore it before running this worktree."
    );
  }
  const urls = discoverUrls(state.root, state.color);
  if (
    Object.keys(services).some(
      (service) => urls[service as Service] !== state.urls[service as Service]
    )
  ) {
    throw new Error(
      "Portless origins have changed. Stop dev servers and rerun worktree:setup to refresh the environment."
    );
  }
}
