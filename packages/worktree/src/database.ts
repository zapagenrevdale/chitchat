import { existsSync } from "node:fs";
import nodePath from "node:path";

import { Client } from "pg";

import { capture, run, writeJson } from "./runtime";
import { databaseUrl, projectName } from "./state";
import type { State } from "./state";

const { join } = nodePath;

const ownerLabel = "io.chitchat.worktree.id";

export function dockerId(root: string) {
  return capture("docker", ["info", "--format", "{{.ID}}"], root);
}

export function assertDocker(state: State) {
  if (dockerId(state.root) !== state.dockerId) {
    throw new Error(
      "Docker is pointing at a different daemon. Select the Docker context used during setup."
    );
  }
}

export function composeArgs(state: Pick<State, "root" | "id">) {
  return [
    "compose",
    "--project-name",
    projectName(state),
    "--file",
    join(state.root, ".worktree", "compose.json"),
  ];
}

export function resourceIds(root: string, project: string) {
  const filter = `label=com.docker.compose.project=${project}`;
  return {
    containers: capture("docker", ["ps", "-aq", "--filter", filter], root)
      .split(/\s+/u)
      .filter(Boolean),
    volumes: capture("docker", ["volume", "ls", "-q", "--filter", filter], root)
      .split(/\s+/u)
      .filter(Boolean),
    networks: capture(
      "docker",
      ["network", "ls", "-q", "--filter", filter],
      root
    )
      .split(/\s+/u)
      .filter(Boolean),
  };
}

function assertResourceOwners(state: State) {
  const resources = resourceIds(state.root, projectName(state));
  const groups = [
    {
      ids: resources.containers,
      command: ["inspect"],
      template: "{{json .Config.Labels}}",
    },
    {
      ids: resources.volumes,
      command: ["volume", "inspect"],
      template: "{{json .Labels}}",
    },
    {
      ids: resources.networks,
      command: ["network", "inspect"],
      template: "{{json .Labels}}",
    },
  ];
  for (const group of groups) {
    for (const id of group.ids) {
      const labels = JSON.parse(
        capture(
          "docker",
          [...group.command, "--format", group.template, id],
          state.root
        )
      );
      if (labels?.[ownerLabel] !== state.id) {
        throw new Error(
          `Docker resource ${id} does not have this worktree's ownership label.`
        );
      }
    }
  }
}

export async function startDatabase(state: State) {
  assertDocker(state);
  assertResourceOwners(state);
  const path = join(state.root, ".worktree", "compose.json");
  if (!existsSync(path)) {
    const labels = { [ownerLabel]: state.id };
    writeJson(path, {
      services: {
        postgres: {
          image: "postgres:18-alpine",
          environment: {
            POSTGRES_DB: "chitchat",
            POSTGRES_USER: "postgres",
            POSTGRES_PASSWORD: "postgres",
          },
          ports: [{ target: 5432, host_ip: "127.0.0.1" }],
          volumes: ["postgres-data:/var/lib/postgresql"],
          labels,
          healthcheck: {
            test: ["CMD-SHELL", "pg_isready -U postgres -d chitchat"],
            interval: "2s",
            timeout: "5s",
            retries: 30,
          },
        },
      },
      volumes: { "postgres-data": { labels } },
      networks: { default: { labels } },
    });
  }
  await run(
    "docker",
    [...composeArgs(state), "up", "-d", "--wait", "--wait-timeout", "90"],
    state.root
  );
  const binding = capture(
    "docker",
    [...composeArgs(state), "port", "postgres", "5432"],
    state.root
  );
  const match = /^127\.0\.0\.1:(?<port>\d+)$/u.exec(binding);
  if (!match) {
    throw new Error(`Unexpected PostgreSQL port binding: ${binding}`);
  }
  return Number(match.groups?.port);
}

export async function removeDatabase(state: State) {
  assertDocker(state);
  assertResourceOwners(state);
  const resources = resourceIds(state.root, projectName(state));
  if (Object.values(resources).every((ids) => ids.length === 0)) {
    return;
  }
  if (!existsSync(join(state.root, ".worktree", "compose.json"))) {
    throw new Error(
      "Missing saved Compose configuration. Restore .worktree/compose.json before teardown."
    );
  }
  await run(
    "docker",
    [...composeArgs(state), "down", "--volumes", "--remove-orphans"],
    state.root
  );
}

export async function checkDatabase(state: State) {
  assertDocker(state);
  const client = new Client({
    connectionString: databaseUrl(state),
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    const result = await client.query<{ ready: boolean }>(
      `SELECT to_regclass('public."User"') IS NOT NULL AS ready`
    );
    if (!result.rows[0]?.ready) {
      throw new Error(
        "Database is reachable but the app schema is missing. Rerun worktree:setup."
      );
    }
  } finally {
    await client.end();
  }
}
