import { spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import nodePath from "node:path";

const { dirname, join, resolve } = nodePath;

export function capture(
  command: string,
  args: string[],
  cwd: string,
  env = process.env
) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf-8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}`
    );
  }
  return result.stdout.trim();
}

export async function run(
  command: string,
  args: string[],
  cwd: string,
  env = process.env
): Promise<void> {
  const child = Bun.spawn([command, ...args], {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${code}`);
  }
}

export async function developmentPort() {
  // Portless 0.15.6 probes the default IPv6 address, which can miss existing
  // IPv4 listeners on macOS. Ask the OS for a port on the app's actual interface.
  const server = createServer();
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  const address = server.address();
  const closed = once(server, "close");
  server.close();
  await closed;
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a loopback development port.");
  }
  return address.port;
}

export function readText(path: string) {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

export function writePrivate(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, contents, { mode: 0o600 });
  renameSync(temporary, path);
}

export function writeJson(path: string, value: unknown) {
  writePrivate(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function workspaceRoot(start = process.cwd()): string {
  const directory = realpathSync(resolve(start));
  const manifest = readText(join(directory, "package.json"));
  if (
    manifest &&
    JSON.parse(manifest).name === "chitchat" &&
    existsSync(join(directory, "turbo.json"))
  ) {
    return directory;
  }
  const parent = dirname(directory);
  if (parent === directory) {
    throw new Error(
      "Run this command inside a Chitchat checkout, or supply --directory <path>."
    );
  }
  return workspaceRoot(parent);
}

export function targetWorkspace(directory?: string) {
  if (!directory) {
    return workspaceRoot();
  }
  // Turbo runs the CLI inside packages/worktree. Relative targets belong to the
  // invoking checkout root, rather than that package's working directory.
  const target = realpathSync(
    nodePath.isAbsolute(directory)
      ? directory
      : resolve(workspaceRoot(), directory)
  );
  if (workspaceRoot(target) !== target) {
    throw new Error(
      "--directory must point to the root of a Chitchat checkout."
    );
  }
  return target;
}

// A PID alone can be reused. Match its start time and command before signalling it.
export function processIdentity(pid: number): string | null {
  const result = spawnSync(
    "ps",
    ["-p", String(pid), "-o", "lstart=", "-o", "command="],
    { encoding: "utf-8" }
  );
  return result.status === 0 ? result.stdout.trim() || null : null;
}
