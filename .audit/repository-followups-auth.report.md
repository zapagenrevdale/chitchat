# RI-007 implementation and proof

The new root `bun run test:auth` command runs an uncached Turborepo task against real PostgreSQL. The child imports the production `index` fetch export and `auth` database export. Production authentication configuration is unchanged.

## Coverage gap

`apps/backend/src/app.test.ts` provides substitute `authHandler` and `getUser` functions. Those tests exercise Hono response handling but do not check Better Auth persistence or cookie revocation. The new journey checks real signup, the persisted user and credential hash, cookie-authenticated identity, wrong-password rejection, fresh signin, signout, session deletion, and saved-cookie replay rejection. It checks Secure, HttpOnly, path, cookie lifetime, no-store, and credentialed CORS.

The integration filenames do not match Vitest's ordinary test-file patterns. The targeted backend run passed all 251 ordinary tests across 24 files.

## Lifecycle and environment

The parent creates exactly one random `cc_auth_<uuidhex>` database per invocation. It records ownership only after CREATE succeeds. Migrations run through the pinned `bun run migrate:deploy` command in `packages/db`. The disposable URL is explicit, and dotenv loading is disabled for migrations.

The default connection is parsed only from `packages/db/.env` DATABASE_URL and checked against the configured worktree's loopback host, port, and name. AUTH_INTEGRATION_DATABASE_URL selects an explicit alternate server. The shell's DATABASE_URL is never a fallback. Both children receive an allowlisted environment with fresh authentication credentials and the configured HTTPS origins.

The parent bounds each child's process group to 90 seconds. It waits for child exit before cleanup and handles SIGINT and SIGTERM. Cleanup drops only the database this invocation created. An AggregateError retains original failures and cleanup failures as causes, while CLI output contains only static stage descriptions and owned database names. An uncatchable parent kill remains a documented orphan possibility.

## Executed verification

Run the retained proof with:

```sh
bun --no-env-file --no-install .audit/repository-followups-auth.prove.ts
```

The proof produced `.audit/repository-followups-auth.receipts.json` and the adjacent concurrent, invalid-prerequisite, and termination logs.

- Two simultaneous root commands completed real authentication journeys. PostgreSQL showed both disposable databases at the same time. Both were deleted afterward.
- A child-runner injection preloaded a cookie-removal wrapper. The actual journey failed with `Session cookie must authenticate /api/me`. Cleanup removed the owned database. This proves the journey depends on the returned cookie rather than a response token.
- A child exited with code 23 after real migrations. The runner retained that failure cause and deleted its database while another invocation's database remained present. The second invocation used a held child-runner seam solely as a lifecycle sentinel, not as another real journey.
- An invalid AUTH_INTEGRATION_DATABASE_URL failed with `must be a PostgreSQL URL` before any CREATE.
- SIGTERM during a real runner invocation caused a nonzero exit and confirmed database deletion.
- The final PostgreSQL database catalog exactly matched its initial catalog.
- `bun run typecheck lint test --filter=@chitchat/backend` passed. Its receipt is `.audit/repository-followups-auth.checks.log`.

Initial lint findings were formatting, regular-expression style, assertion style, and one complexity limit. Those were fixed. The formatter also changed a shorthand error cause incorrectly; the explicit `cause: error` fields now pass typecheck and are verified by the injected-failure proof.

## Decisions and handoff

Separate Before Serializing Shared State led to per-invocation databases instead of shared-row cleanup or a lock. Model the Domain led to explicit ownership state and one child-runner boundary. Test Behavior, Not Implementation led to production Hono requests and persisted session checks. Prove It Works led to concurrent database-catalog observations and the missing-cookie mutation. Technical Writing and Unslop shaped the command documentation and this report.

The baseline copies are `.audit/repository-followups-auth.baseline.json` and `.audit/repository-followups-auth.baseline.diff`. The scoped incremental diff is `.audit/repository-followups-auth.changes.diff`. No commits, dependency installs, nested agents, or product-user creation outside disposable databases were performed.

There is no implementation blocker. The parent owns independent review and the final four full-repository checks. These in-process requests do not prove browser cookie enforcement or browser TLS behavior.
# Post-review correction

Independent review accepted the integration and reran `bun run test:auth` successfully, including owned-database cleanup. The coordinator removed the flagged narrative comment about migration ordering. Executable code is unchanged; preserved implementation snapshots and diffs precede that comment deletion.
