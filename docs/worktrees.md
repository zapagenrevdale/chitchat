# Agent worktrees

Each configured checkout gets a stable color, a PostgreSQL container and volume, and three Portless URLs. The tools work on macOS and Linux with Bun 1.4.2, Node.js 24+, Docker Compose, and `ps` available. Git is needed to create linked worktrees; setup also works in an ordinary checkout.

## Create and run

After these files are committed in the source repository:

```sh
git worktree add ../chitchat-feature -b feature
cd ../chitchat-feature
bun install --frozen-lockfile
bun run worktree:setup
bun run dev
```

The first install bootstraps the pinned CLI and Turborepo. Setup also runs a frozen install, so repeating setup after dependency changes brings the checkout up to date.

Setup checks tool versions, Docker, and Portless; reserves a color; starts PostgreSQL; writes the local environment; generates Prisma's client; and applies committed migrations. It checks that the resulting database contains the app schema before marking the checkout ready.

On a machine where Portless has never run, start it once interactively with the pinned `bunx --no-install portless proxy start` command to complete any OS certificate/privileged-port authorization. Subsequent agent setups reuse that proxy.

An assignment of `coral` on this machine produces:

| Service | URL |
| --- | --- |
| Web | `https://coral.cc.local` |
| API | `https://api.coral.cc.local` |
| Email preview | `https://email.coral.cc.local` |

URLs follow the active Portless proxy's scheme, suffix, and port. A default `.localhost` proxy produces `.cc.localhost` URLs. Setup derives `VITE_API_URL`, `VITE_SITE_URL`, `WEB_ORIGIN`, and `BETTER_AUTH_URL` together. App ports and the loopback-only PostgreSQL port are assigned dynamically.

For a preferred color:

```sh
bun run worktree:setup --color coral
```

Colors remain reserved while development servers are stopped. Setup rejects a color reserved by another checkout or already used by a Portless route. All local clones share the registry, so concurrent agents cannot reserve the same color.

Stop development servers before rerunning setup. A rerun keeps the color, auth secret, and database data, then applies any new committed migrations. If setup fails, fix the reported problem and rerun it, or run teardown. The saved `provisioning` state records resources created before a failure.

## Environment and secrets

Setup starts from each package's `.env.example` when `.env` is absent. Existing `.env` files are backed up before managed values are changed. It generates a fresh Better Auth secret for the worktree and preserves it on subsequent setups.

Integration credentials can be copied explicitly:

```sh
bun run worktree:setup --copy-secrets-from /absolute/path/to/main
```

This copies missing `GEMINI_API_KEY` and `GEMINI_API_KEY_LIVE` from the source backend `.env`. They stay in `apps/backend/.env`. Auth secrets, database URLs, and origins are generated for the destination.

Keep worktree settings in the generated `.env` files. Setup rejects package `.env.local` and mode-specific environment files because those can override its URLs or database. Do not export a different checkout's `DATABASE_URL` or `VITE_*` values into the shell used for migrations and builds.

Generated state and environment backups live in `.worktree/`, which is gitignored and private to the checkout. Do not copy that directory into another worktree or edit its ownership metadata. Teardown restores the original environment files. If you edited a generated environment file, your edited version is also saved alongside it as `.env.worktree-<id>-<uuid>.bak`.

## Check and inspect

With `bun run dev` running in another terminal:

```sh
bun run worktree:check
bun run worktree:status
```

`worktree:check` runs typecheck, lint, tests, and build through Turborepo, plus uncached smoke checks for database connectivity/schema, the web page, API health, credentialed CORS, and the email preview. HTTPS checks verify certificates using the Portless CA.

Status reports the worktree identity, URLs, running services, Docker resources, and reservations across local checkouts. It flags missing directories and missing manifests without releasing their colors.

For agents, write a JSON status file:

```sh
bun run worktree:status --output .worktree/status.json
```

Read `.worktree/status.json` for a single JSON document without Turborepo's log wrapper. `--json` also prints JSON in the task output. Status excludes auth secrets and API keys.

The registry is stored at `$XDG_STATE_HOME/chitchat/worktrees/registry.sqlite`, defaulting to `~/.local/state/chitchat/worktrees/registry.sqlite`. `CHITCHAT_WORKTREE_HOME` can override its directory for isolated tooling tests; keep the same value throughout a worktree's lifecycle. SQLite transactions coordinate reservations and per-checkout operation leases. A new command can reclaim a lease left by a process that has exited.

## Merge or remove

Run teardown before deleting the directory, including when a branch has been merged:

```sh
# From inside the linked worktree:
bun run worktree:teardown

# From the main checkout, after saving any changes you want to keep:
git worktree remove ../chitchat-feature
```

Teardown stops the recorded Portless app processes, removes their routes, deletes the worktree's PostgreSQL container/network/volume, restores environment files, and releases the color. It verifies process identities, Docker ownership labels, and the original Docker daemon before cleanup. Repeating teardown succeeds when the resources are already gone. An incomplete teardown stays in `deleting` state and can be retried.

You can also target an existing checkout from the main workspace:

```sh
bun run worktree:teardown --directory ../chitchat-feature
bun run worktree:status --directory ../chitchat-feature
```

If a worktree directory was accidentally deleted first, restore it and its ignored `.worktree/` metadata before teardown. Orphan reporting retains the resource ID and Compose project name for recovery. Cleanup is explicit; merging a branch does not automatically delete its local database.

## Adding seed data later

Add a repeatable seed command in `packages/db` when test accounts and fixtures are defined, then wire an explicit setup `--seed` option to it. Keep migration deployment separate from seeding so setup reruns preserve data. A future reset command can recreate only the database resources owned by the saved worktree identity.
