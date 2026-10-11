# Backend repair receipt

Source files changed under apps/backend/src/practice.

- feedback.ts adds a module-level word Segmenter and counts isWordLike segments. The three-user-turn, two-partner-turn, 20-word gate remains.
- feedback.test.ts covers substantial Japanese, Chinese, Thai, short input, punctuation, chunks, validation, and assessor absence through the endpoint. The parameterized empty case now covers the removed redundant test. The large positive test checks assessor input and response.
- routes.ts adds the local 512 KiB body ceiling and repairs optional caption failure handling. The existing overall deadline and five-second cap remain. Client cancellation still rejects the session response.
- transcription.test.ts covers controlled mandatory timeout, overall deadline during captions, caption cap, client cancellation, late provider tokens, success, failure, and omission.
- transcript-body-budget.test.ts covers all three transcript endpoints with 60,000 Unicode characters across 300 messages, raw and escaped JSON, semantic overflow, and HTTP overflow.

Pre-edit copies are in repository-improvement-backend.baseline/. These include the dirty routes.ts baseline. repository-improvement-backend.scoped.diff isolates this task from that baseline.

## Verification

The root command was run before production edits and after implementation.

```sh
bun run test --filter=@chitchat/backend -- src/practice/feedback.test.ts src/practice/transcription.test.ts src/practice/transcript-body-budget.test.ts
```

Both test logs show the actual forwarded Vitest command with all three paths.

- repository-improvement-backend.red.log records 16 failures and 39 passes. Valid large requests returned 413 rather than 200. Semantic overflow returned 413 rather than 400. Overall deadline expiration during captions returned 502 rather than 201. A late caption token was returned rather than null. Multilingual conversations made zero assessor calls. Punctuation received scored feedback rather than insufficient.
- repository-improvement-backend.green.log records 55 passes across three files.
- repository-improvement-backend.typecheck.log records successful backend typecheck through root Turbo. An initial optional-controller lookup error in the new test was corrected with a literal case table.
- repository-improvement-backend.format.log records successful scoped formatting/lint through root Turbo with zero warnings and zero errors. Initial test style errors were corrected before the final run.
- Scoped git diff --check passed.

## Principles and remaining work

Model the Domain kept existing transcript and optional-token shapes and used a typed cancellation table. Test Behavior, Not Implementation changed rejection assertions to assessor absence and positives to provider input and response. Prove It Works required red endpoint reproduction, actual command forwarding evidence, and a green rerun.

No known unresolved local failure remains. The provider must honor cancellation, as required by scope. The parent owns independent review and the four root checks. No commits, resets, rebases, or nested agents were used.

## BR-001 review correction

The reviewer found that the route could swallow the cancellation assertion inside the mocked provider and return the expected null token. The correction changes only `transcription.test.ts`. The test now reads the supplied AbortSignal from the typed mock's recorded call after awaiting the request and checks its aborted state and expected reason outside the route catch. All six rejection and late-token cases remain. The two timeout calls are checked together to stay within the repository's assertion-count lint limit.

Test Behavior, Not Implementation required a mutation experiment against the actual route. Model the Domain preserved the typed mock and existing cancellation table. The opt-in `.audit/repository-improvement-backend-br001.mutation.config.mjs` loads a test setup that replaces only the second `AbortSignal.any` result per test with an unconnected signal. The original implementation handles other calls. `afterEach` restores all spies even when assertions fail, and the isolated Vitest process exits afterward. No production file was edited. The normal test command does not load this setup.

The final source was exercised by these root Turbo commands, each with cache bypass.

```sh
bun run test --filter=@chitchat/backend --force -- src/practice/transcription.test.ts --config ../../.audit/repository-improvement-backend-br001.mutation.config.mjs
bun run test --filter=@chitchat/backend --force -- src/practice/transcription.test.ts
bun run lint --filter=@chitchat/backend --force -- src/practice/transcription.test.ts
bun run typecheck --filter=@chitchat/backend --force
```

- `.audit/repository-improvement-backend-br001.red.log` preserves the expected nonzero mutation run. All six cancellation rows fail at `expect(suppliedSignal).toMatchObject({ aborted: true, reason })` with `expected AbortSignal { aborted: false } to match object { aborted: true, …(1) }`. Six other tests pass.
- `.audit/repository-improvement-backend-br001.green.log` records 12 passing tests after the mutation process exited.
- `.audit/repository-improvement-backend-br001.lint.log` records correct formatting, zero warnings, and zero errors for the changed test. An initial lint run flagged the assertion count and boolean matcher; the final assertions were consolidated before rerunning mutation and green tests.
- `.audit/repository-improvement-backend-br001.typecheck.log` records a successful forced backend typecheck.
- The five-file backend scoped diff was regenerated against the original baseline snapshots, including the new transcript byte-budget test. `git diff --check -- apps/backend/src/practice/transcription.test.ts` passed.

This correction does not rerun the parent's full-root checks or replace independent review. Existing dirty source work was preserved. No commits, resets, rebases, or nested agents were used.
