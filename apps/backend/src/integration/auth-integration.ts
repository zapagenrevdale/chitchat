import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SQL } from "bun";
import { z } from "zod";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const statusSchema = z.object({
  configured: z.literal(true),
  root: z.string(),
  phase: z.literal("ready"),
  urls: z.object({ web: z.url(), backend: z.url() }),
  database: z.object({
    host: z.string(),
    port: z.number().int(),
    name: z.string(),
  }),
});

type ChildRunner = (child: {
  command: string[];
  cwd: string;
  env: Record<string, string>;
  signal: AbortSignal;
  stage: "migrations" | "journey";
}) => Promise<void>;

const runChild: ChildRunner = async ({ command, cwd, env, signal, stage }) => {
  signal.throwIfAborted();
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
  });
  const terminate = () => {
    try {
      // The migration command also owns a Prisma subprocess.
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  const deadline = setTimeout(terminate, 90_000);
  signal.addEventListener("abort", terminate, { once: true });
  try {
    const code = await child.exited;
    signal.throwIfAborted();
    if (code !== 0) {
      throw new Error(
        `${stage} child failed (exit ${code}, signal ${child.signalCode ?? "none"}).`
      );
    }
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", terminate);
    terminate();
  }
};

async function worktreeDatabaseUrl() {
  let text: string;
  try {
    text = await readFile(`${root}packages/db/.env`, "utf-8");
  } catch {
    throw new Error(
      "Missing packages/db/.env. Run worktree:setup or set AUTH_INTEGRATION_DATABASE_URL."
    );
  }
  const values = [
    ...text.matchAll(/^[\t ]*DATABASE_URL[\t ]*=[\t ]*(?<value>[^\r\n]*)$/gmu),
  ];
  if (values.length !== 1) {
    throw new Error("packages/db/.env must contain exactly one DATABASE_URL.");
  }
  return values[0]?.groups?.value
    ?.trim()
    .replace(/^(?<quote>["'])(?<value>.*)\k<quote>$/u, "$<value>");
}

async function configuration() {
  let status: z.infer<typeof statusSchema>;
  try {
    status = statusSchema.parse(
      JSON.parse(await readFile(`${root}.worktree/status.json`, "utf-8"))
    );
  } catch {
    throw new Error(
      "Run worktree:setup and worktree:status --output .worktree/status.json first."
    );
  }
  if (status.root !== root.replace(/\/$/u, "")) {
    throw new Error(
      "Worktree status belongs to another checkout. Refresh worktree:status."
    );
  }
  const web = new URL(status.urls.web);
  const backend = new URL(status.urls.backend);
  if (
    [web, backend].some(
      (url) =>
        url.protocol !== "https:" || url.origin !== url.href.replace(/\/$/u, "")
    )
  ) {
    throw new Error(
      "Authentication integration requires configured HTTPS web and API origins."
    );
  }
  let raw = process.env.AUTH_INTEGRATION_DATABASE_URL;
  const explicit = raw !== undefined;
  if (!explicit) {
    raw = await worktreeDatabaseUrl();
  }
  let base: URL;
  try {
    base = new URL(raw ?? "");
    if (
      !["postgres:", "postgresql:"].includes(base.protocol) ||
      !base.hostname ||
      base.pathname === "/"
    ) {
      throw new Error("Invalid PostgreSQL target.");
    }
  } catch {
    throw new Error(
      "AUTH_INTEGRATION_DATABASE_URL or packages/db/.env DATABASE_URL must be a PostgreSQL URL."
    );
  }
  if (
    !explicit &&
    (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
      base.hostname !== status.database.host ||
      Number(base.port || 5432) !== status.database.port ||
      decodeURIComponent(base.pathname.slice(1)) !== status.database.name)
  ) {
    throw new Error(
      "Default database target does not match the isolated worktree status. Refresh worktree:status."
    );
  }
  return { base, web: web.origin, backend: backend.origin };
}

export async function runAuthIntegration(childRunner: ChildRunner = runChild) {
  const { base, web, backend } = await configuration();
  const database = `cc_auth_${crypto.randomUUID().replaceAll("-", "")}`;
  const disposable = new URL(base);
  disposable.pathname = `/${database}`;
  const adminUrl = new URL(base);
  adminUrl.pathname = "/postgres";
  let admin: SQL;
  try {
    admin = new SQL(adminUrl.href, { max: 1, connectionTimeout: 5 });
  } catch {
    throw new Error(
      "Invalid PostgreSQL connection options for authentication integration."
    );
  }
  const controller = new AbortController();
  const terminate = () =>
    controller.abort(new Error("Authentication integration interrupted."));
  process.on("SIGINT", terminate);
  process.on("SIGTERM", terminate);
  let ownedDatabase: string | undefined;
  const failures: Error[] = [];
  let stage =
    "PostgreSQL prerequisite (connect to postgres with CREATEDB permission)";
  try {
    await admin`SET statement_timeout = '15s'`;
    controller.signal.throwIfAborted();
    await admin.unsafe(`CREATE DATABASE "${database}"`);
    ownedDatabase = database;
    console.log(`auth integration created ${database}`);
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
      DATABASE_URL: disposable.href,
      DOTENV_CONFIG_PATH: "/dev/null",
      BETTER_AUTH_URL: backend,
      WEB_ORIGIN: web,
      BETTER_AUTH_SECRET: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      PORT: "4000",
    };
    for (const task of ["migrations", "journey"] as const) {
      stage = task;
      controller.signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop
      await childRunner({
        command:
          task === "migrations"
            ? [
                process.execPath,
                "--no-env-file",
                "--no-install",
                "run",
                "migrate:deploy",
              ]
            : [
                process.execPath,
                "--no-env-file",
                "--no-install",
                "src/integration/auth-journey.ts",
              ],
        cwd: `${root}${task === "migrations" ? "packages/db" : "apps/backend"}`,
        env,
        signal: controller.signal,
        stage: task,
      });
      console.log(`auth integration ${task} passed`);
    }
    controller.signal.throwIfAborted();
  } catch (error) {
    failures.push(
      new Error(
        `Authentication integration failed during ${stage}${controller.signal.aborted ? " (interrupted)" : ""}.`,
        { cause: error }
      )
    );
  } finally {
    if (ownedDatabase) {
      try {
        await admin.unsafe(`DROP DATABASE "${ownedDatabase}" WITH (FORCE)`);
        console.log(`auth integration dropped ${ownedDatabase}`);
      } catch (error) {
        failures.push(
          new Error(`Cleanup failed for owned database ${ownedDatabase}.`, {
            cause: error,
          })
        );
      }
    }
    try {
      await admin.close({ timeout: 5 });
    } catch (error) {
      failures.push(
        new Error("Closing the PostgreSQL admin connection failed.", {
          cause: error,
        })
      );
    }
    process.removeListener("SIGINT", terminate);
    process.removeListener("SIGTERM", terminate);
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      failures.map((error) => error.message).join("\n")
    );
  }
}

if (import.meta.main) {
  try {
    await runAuthIntegration();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Authentication integration failed."
    );
    process.exitCode = 1;
  }
}
