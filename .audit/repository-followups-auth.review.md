# RI-007 independent review

Accepted for functional correctness. No blocking defect found in the six owned files or their scoped incremental diff. This is an independent same-model review by GPT-6 Astra, not a cross-model verdict.

## Scope and method

Read the implementation report, receipts, retained proof and mutation code, concurrent and termination logs, backend check log, baseline snapshot, scoped incremental diff, and all six current owned files. Also traced production composition, the Prisma adapter, migration command, and committed migration SQL. The ordinary Git diff includes earlier work that the baseline correctly excludes from RI-007.

Throughput checkpoint is not applicable to this read-only investigation. The user's single-artifact and no-nested-agent limits superseded workflow requests for additional tracking files and delegates. I read the no-comments skill and its reviewer instructions and performed the comment audit directly.

## Verified behavior

- `apps/backend/src/integration/auth-journey.ts:16-39` imports the real database and production `index` fetch export. `apps/backend/src/index.ts:24-28` connects Hono to `auth.handler` and `auth.api.getSession`. `apps/backend/src/app.ts:45-65` supplies the actual CORS, auth routes, identity route, and no-store response. There are no substitute authentication functions in the journey.
- `auth-journey.ts:58-83` extracts the returned secure session cookie and checks Secure, HttpOnly, path, positive lifetime, and expiry on signout. `auth-journey.ts:86-118` authenticates with that cookie, checks identity, verifies persisted session deletion, and replays the saved original cookie expecting 401 and Unauthorized. This exercises server-side revocation, independently of a client discarding the cookie.
- `auth-journey.ts:124-190` verifies the persisted user and credential account through Prisma, checks a nonplaintext password value, rejects a wrong password without a cookie or database session, and authenticates a fresh signin. `apps/backend/src/auth.ts:7-14` uses the production Better Auth Prisma adapter. `packages/db/src/client.ts:5-6` constructs the actual PostgreSQL-backed Prisma client.
- `apps/backend/src/integration/auth-integration.ts:62-141` reads only the designated DATABASE_URL entry for the default target and checks worktree root, HTTPS origins, loopback host, port, and database name. An alternate server requires the explicit integration variable. The shell's DATABASE_URL is not a fallback.
- `auth-integration.ts:146-183` creates a random database, records ownership only after CREATE succeeds, and passes a disposable URL and fresh secret in an allowlisted child environment. `auth-integration.ts:184-209` runs pinned migration deployment before the journey. `packages/db/prisma.config.ts:1-10` honors the explicit URL and the disabled dotenv path. The committed migration contains only schema, table, index, and foreign-key DDL in that connection's database. I found no application-row write path to the preexisting worktree database.
- `auth-integration.ts:28-59` bounds each real child to 90 seconds, kills its detached process group on timeout or abort, and awaits child exit. `auth-integration.ts:159-249` handles SIGINT and SIGTERM, drops only the successfully created database, closes the admin connection, and preserves original and cleanup errors as causes. CLI output exposes static stage descriptions and owned database names rather than nested credential-bearing errors.
- `package.json:14`, `apps/backend/package.json:11-12`, and `turbo.json:37-40` provide the root task, leave ordinary Vitest separate, and explicitly disable auth-task caching. The integration filenames do not match ordinary Vitest test patterns. The retained backend check log records 251 passing tests in 24 files, typecheck, and lint.

## Independently executed check

I ran `bun run test:auth` from the root. It exited successfully, bypassed the auth-task cache, completed migrations and the production journey, and reported deletion of its exact owned database `cc_auth_fbdf3544a2794720af073d5a4d8b6f52`. The other three tasks were cached dependency builds. This review did not rerun the full repository checks.

Prove It Works shaped this decision. I traced the real production imports and reran the root artifact rather than accepting the implementation report alone.

## Proof-claim assessment

- The retained concurrent logs show two successful real root journeys with different database names. `.audit/repository-followups-auth.prove.ts:25-41` observes both databases concurrently and compares the final catalog with its initial catalog. The receipt accurately records that proof. I inspected it but did not rerun the concurrent proof.
- The mutation at `.audit/repository-followups-auth.without-cookie.ts:3-7` removes the Cookie header before the production fetch call. The proof at `prove.ts:43-64` requires the specific authenticated-identity assertion failure and checks catalog restoration. This supports cookie dependence. It does not mutate production signout or prove every individual assertion detects a defect.
- `prove.ts:66-102` uses a held injected runner as the second invocation during the failure-isolation probe. It proves cleanup preserves that invocation's database. It is not a second real authentication journey, which the implementation report correctly states. The failed invocation runs real migrations before the injected exit-23 child, and the proof inspects the retained error cause.
- `prove.ts:104-128` checks an invalid URL and sends SIGTERM directly to the runner after CREATE. The termination log records migration-stage interruption and database deletion. This does not separately prove root Bun/Turbo signal forwarding, SIGINT, the full 90-second timeout, or a database DROP failure. Those paths received code inspection only.
- Catalog equality proves no leftover or deleted database names in the observed runs. It does not measure every preexisting row for changes. The absence of shared application-data writes is supported by the inspected connection and migration paths, not by a claimed row-level snapshot.
- The HTTP requests run through Hono fetch in process. Browser cookie policy and network TLS are outside this proof, as `docs/worktrees.md:95` correctly states. Uncatchable parent termination can leave an orphan, as documented at line 93.

## Comments and suppressions

One nonblocking comment-cleanup finding remains at `apps/backend/src/integration/auth-integration.ts:187`. The migration-before-journey sentence narrates the explicit ordered task list. Remove that comment under the no-comments rule. The ordering itself is correct.

The process-group comment at line 39 explains the externally spawned Prisma descendant and supports the platform-specific group kill. Keep it. The `no-await-in-loop` suppression at line 188 is justified because these two dependent stages cannot run concurrently. It suppresses a parallelization recommendation, not a correctness or safety check. No introduced TypeScript suppressions or other lint suppressions were found in the scoped diff.

No source edits, nested agents, comment deletions, restored comments, architect sketches, or constraint encodings were performed. Only this review artifact was authored. The no-comments audit is manual under the user's delegation restriction, and the narration finding remains open for the owner.
