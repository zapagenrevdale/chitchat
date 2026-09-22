import { Database } from "bun:sqlite";
import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { processIdentity } from "./runtime";

const { join, resolve } = path;

export const colors = [
  "amber",
  "amethyst",
  "apricot",
  "aqua",
  "azure",
  "bronze",
  "cerulean",
  "cobalt",
  "copper",
  "coral",
  "crimson",
  "cyan",
  "emerald",
  "fuchsia",
  "gold",
  "indigo",
  "ivory",
  "jade",
  "lavender",
  "lemon",
  "lilac",
  "lime",
  "magenta",
  "maroon",
  "mint",
  "ochre",
  "olive",
  "orange",
  "peach",
  "pearl",
  "plum",
  "rose",
  "ruby",
  "saffron",
  "sage",
  "salmon",
  "sapphire",
  "scarlet",
  "silver",
  "slate",
  "tangerine",
  "teal",
  "turquoise",
  "umber",
  "violet",
];

export interface Reservation {
  id: string;
  root: string;
  color: string;
  createdAt: string;
}

interface Lease {
  token: string;
  pid: number;
  identity: string;
}

export function registryDirectory() {
  return resolve(
    process.env.CHITCHAT_WORKTREE_HOME ??
      join(
        process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
        "chitchat",
        "worktrees"
      )
  );
}

export class Registry {
  readonly directory: string;
  private readonly database: Database;

  constructor(directory = registryDirectory()) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.database = new Database(join(directory, "registry.sqlite"), {
      create: true,
    });
    this.database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY, root TEXT UNIQUE NOT NULL,
        color TEXT UNIQUE NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS leases (
        root TEXT PRIMARY KEY, token TEXT NOT NULL,
        pid INTEGER NOT NULL, identity TEXT NOT NULL
      );
    `);
  }

  list() {
    return this.database
      .query<Reservation, []>("SELECT * FROM reservations ORDER BY createdAt")
      .all();
  }

  reserve(
    root: string,
    requested: string | undefined,
    occupied: (color: string) => boolean
  ) {
    return this.database
      .transaction(() => {
        const existing = this.list().find((entry) => entry.root === root);
        if (existing) {
          if (requested && existing.color !== requested) {
            throw new Error(
              `This worktree already owns ${existing.color}. Teardown before changing its color.`
            );
          }
          return existing;
        }
        if (requested && !colors.includes(requested)) {
          throw new Error(
            `Unknown color ${requested}. Choose from: ${colors.join(", ")}`
          );
        }
        const taken = new Set(this.list().map((entry) => entry.color));
        const available = (requested ? [requested] : colors).filter(
          (color) => !taken.has(color) && !occupied(color)
        );
        if (available.length === 0) {
          throw new Error(
            requested
              ? `Color ${requested} is already reserved or has an active Portless route.`
              : "All colors are reserved. Teardown an unused worktree first."
          );
        }
        const entry = {
          id: crypto.randomUUID(),
          root,
          color: available[randomInt(available.length)],
          createdAt: new Date().toISOString(),
        };
        this.database
          .query(
            "INSERT INTO reservations (id, root, color, createdAt) VALUES (?, ?, ?, ?)"
          )
          .run(entry.id, entry.root, entry.color, entry.createdAt);
        return entry;
      })
      .immediate();
  }

  assertOwner(entry: Pick<Reservation, "id" | "root" | "color">) {
    const reservation = this.list().find((item) => item.id === entry.id);
    if (reservation?.root !== entry.root || reservation.color !== entry.color) {
      throw new Error(
        "Worktree identity does not match its registry reservation."
      );
    }
  }

  release(entry: Pick<Reservation, "id" | "root" | "color">) {
    this.assertOwner(entry);
    this.database
      .query("DELETE FROM reservations WHERE id = ? AND root = ?")
      .run(entry.id, entry.root);
  }

  // SQLite serializes reservation/lease changes; provisioning runs outside the transaction.
  // A crashed command's lease is reclaimable, while a live command keeps exclusive ownership.
  async exclusive<T>(root: string, action: () => Promise<T>): Promise<T> {
    const token = crypto.randomUUID();
    const identity = processIdentity(process.pid);
    if (!identity) {
      throw new Error("Cannot identify the current process; ps is required.");
    }
    const acquire = this.database.transaction(() => {
      const lease = this.database
        .query<Lease, [string]>("SELECT * FROM leases WHERE root = ?")
        .get(root);
      if (lease && processIdentity(lease.pid) === lease.identity) {
        return false;
      }
      this.database
        .query(
          "INSERT OR REPLACE INTO leases (root, token, pid, identity) VALUES (?, ?, ?, ?)"
        )
        .run(root, token, process.pid, identity);
      return true;
    });
    const deadline = Date.now() + 10_000;
    while (!acquire.immediate()) {
      if (Date.now() >= deadline) {
        throw new Error(
          `Another worktree command is running for ${root}. Retry when it finishes.`
        );
      }
      // Retry the same lock; parallel attempts cannot make progress independently.
      // oxlint-disable-next-line no-await-in-loop
      await delay(50);
    }
    try {
      return await action();
    } finally {
      this.database
        .query("DELETE FROM leases WHERE root = ? AND token = ?")
        .run(root, token);
    }
  }

  close() {
    this.database.close();
  }
}
