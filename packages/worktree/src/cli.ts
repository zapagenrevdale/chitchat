#!/usr/bin/env bun
import path from "node:path";
import { parseArgs } from "node:util";

import { develop } from "./development";
import { setup, smoke, status, teardown } from "./lifecycle";
import { Registry, registryDirectory } from "./registry";
import { targetWorkspace, writeJson } from "./runtime";
import { loadState, services } from "./state";
import type { Service } from "./state";

const help = `Chitchat worktree tools

  bun run worktree:setup [--color coral] [--copy-secrets-from /path/to/main]
  bun run dev
  bun run worktree:status [--json]
  bun run worktree:check                 All checks; requires bun run dev in another terminal
  bun run worktree:teardown

Options:
  --directory <path>       Target another Chitchat checkout
  --color <color>          Reserve a preferred available color during setup
  --copy-secrets-from <path>  Copy missing Gemini settings from that checkout's backend .env
  --json                  Print machine-readable status (contains no auth/API secrets)
  --output <file>          Write status JSON to a file, avoiding Turbo's log wrapper
  --help                  Show this help
`;

function printStatus(report: ReturnType<typeof status>, json = false) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(
    report.configured
      ? `${report.color} (${report.phase})\n${JSON.stringify(report.urls, null, 2)}\nRunning: ${report.runningServices.join(", ") || "none"}`
      : "This checkout has not been set up."
  );
  console.log(`\nDatabase: ${JSON.stringify(report.database, null, 2)}`);
  if (report.databaseError) {
    console.log(`Database status unavailable: ${report.databaseError}`);
  }
  console.log(
    `\nReservations:\n${report.reservations.map((entry) => `${entry.color}: ${entry.root}${entry.orphaned ? " [orphaned directory]" : ""}${entry.manifestMissing ? " [missing manifest]" : ""}`).join("\n") || "none"}`
  );
}

async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      directory: { type: "string" },
      color: { type: "string" },
      "copy-secrets-from": { type: "string" },
      json: { type: "boolean" },
      output: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const [command, service] = positionals;
  if (!["setup", "teardown", "status", "smoke", "dev"].includes(command)) {
    throw new Error(help);
  }
  if (
    positionals.length > (command === "dev" ? 2 : 1) ||
    ((values.json || values.output) && command !== "status") ||
    ((values.color || values["copy-secrets-from"]) && command !== "setup")
  ) {
    throw new Error(
      `Options do not apply to ${command}. Use --help for usage.`
    );
  }
  const root = targetWorkspace(values.directory);
  if (command === "dev") {
    if (!(service in services)) {
      throw new Error("dev requires web, backend, or email.");
    }
    await develop(root, service as Service);
    return;
  }
  const saved = loadState(root);
  if (saved && saved.registryDirectory !== registryDirectory()) {
    throw new Error(
      `Registry differs from setup. Set CHITCHAT_WORKTREE_HOME=${saved.registryDirectory}`
    );
  }
  const registry = new Registry();
  try {
    switch (command) {
      case "setup": {
        const state = await setup(root, registry, {
          color: values.color,
          copySecretsFrom: values["copy-secrets-from"],
        });
        console.log(
          `\nWorktree ${state.color} is ready.\nWeb:   ${state.urls.web}\nAPI:   ${state.urls.backend}\nEmail: ${state.urls.email}\n\nRun bun run dev, then bun run worktree:check in another terminal.`
        );
        break;
      }
      case "teardown": {
        await teardown(root, registry);
        console.log(
          "Worktree resources removed. The checkout can now be removed with git worktree remove."
        );
        break;
      }
      case "status": {
        const report = status(root, registry);
        if (values.output) {
          const output = path.resolve(root, values.output);
          writeJson(output, report);
          console.log(`Status written to ${output}`);
        } else {
          printStatus(report, values.json);
        }
        break;
      }
      case "smoke": {
        await smoke(root, registry);
        break;
      }
      default: {
        throw new Error(help);
      }
    }
  } finally {
    registry.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
