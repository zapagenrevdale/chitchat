# Final follow-up artifact review

Verdict is BLOCKED on browser instrumentation and closure evidence. The four implementation units have accepted independent source/test reviews. Their attribution remains sound. This review does not establish final RI-001/002 browser closure.

This is an independent same-model GPT-6 Astra review, not a multi-model or cross-provider verdict. Workflow delegation and multi-model tools were unavailable, and nested agents were prohibited. Only this report was written. Application files remained read-only. The private scratchpad was never accessed. The original dirty baseline was not reviewed as a whole.

Throughput checkpoint is n/a, read-only investigation. The Investigation workflow and manual no-comments review were applied within the single-artifact restriction. Separate workflow tracking and delegated workflow steps were skipped. Prove It Works shaped the direct log inspection, browser assertion review, and in-memory snapshot comparison. Unslop shaped this report.

## Blocking findings

### FR-001. The exact persisted-goal oracle has the wrong data shape

`.audit/repository-followups-browser.ts:198,219` compares the entire persisted `resolvedGoal` with `fixture.outcome`. That endpoint outcome at `.audit/repository-followups-browser.voice.js:2-7` has no `reply`. The real controller deliberately adds `reply` from the spoken acknowledgment at `apps/web/src/lib/onboarding-live.ts:676-682` before publishing completion.

The inspected closure artifact confirms this distinction. Its `blocked.draft.resolvedGoal` contains the expected status, goal, skills, benefits, and `reply` equal to the assistant fixture message. Its `voiceProviderFixture.outcome` contains the same outcome fields without `reply`. The current deep-equality assertions therefore reject the correctly enriched stored value. The observed run stopped earlier, so this is a source-supported latent assertion failure, not a claim that those assertions executed.

Define a separate explicit expected persisted turn containing the endpoint outcome and the expected acknowledgment reply. Compare the complete saved turn with that value before and after reload. Retain wrong-goal and wrong-reply negative cases. The offline hardening checks at `repository-followups-browser-hardening.check.ts:51-66` test transcript and error helpers but do not exercise this persisted-turn comparison. Their passing receipt cannot establish that oracle's correctness.

### FR-002. The available closure run ended with an execution blocker

I inspected `.audit/repository-followups-browser.closure.json` once when it was available. It records `exitCode: 2`, an empty assertion-failure list, and 21 unexpected errors. The voice fixture rejected a React Grab version request. CDP also blocked React Grab API requests and the Google Fonts stylesheet. The run never reached the reload assertions. No browser was launched, no browser command was run, and no artifact polling followed.

The cause is visible in `repository-followups-browser.ts:94-95,134` and `repository-followups-browser.voice.js:37`. The strict interception policy includes unrelated development traffic and stylesheet requests. Keep provider and onboarding requests strict, but explicitly account for the known auxiliary requests with narrowly scoped deterministic fixtures or equivalent isolation. Do not broadly ignore network errors. Then rerun serially under a fresh evidence label after correcting FR-001.

The artifact supports partial positive observations. `textRecovered` is true; the two held POSTs have different network IDs and the distinct expected answers; the initial and retry controls are disabled while pending; restoration enables the same controls; both held requests have correlated cancellation records. The blocked voice snapshot has an expanded, controlled, visible transcript with both messages, enabled Continue, and the enriched goal persisted. These observations are useful, but there is no recorded benefits reload result. An empty `failures` array does not make this blocked run a pass.

## Hardening rereview

The strengthened scripts address the substance of the original `repository-followups-browser.review.md` requests, subject to the blockers above.

- Text controls are scoped to the motivation form. Pending state, request-ID cancellation, recovered controls, a distinct retry payload, and pending retry state are checked at TS lines 145-174.
- Completed transcript assertions check expansion, controlled log identity, visibility, both expected message texts, and enabled visible Continue at TS lines 23-30,75-76,194-196.
- Navigation waits for a new top-level document. Reload checks rendered benefits heading and three visible cards with their expected content, independently of storage, at TS lines 61-66,201-222.
- Setup and socket deadlines are inside the reporting boundary. Runtime, console, network, and fixture errors affect the exit result. Cleanup failures are recorded. Baseline labels and existing evidence are protected at TS lines 101-116,225-250.
- The fixture handles Request and string inputs, validates learner and completion payloads, enforces call order/count, and rejects unmatched operations. The synthetic lifecycle and provider boundaries are disclosed.

The hardening receipt's claim that closure blockers are addressed needs qualification until FR-001/002 are resolved. Offline checks validate selected helpers and failure paths, not successful end-to-end closure. Audio worklet execution and audible playback are correctly described as not independently asserted by this browser runner.

## Unit reviews and attribution

I read all four implementation reports and all four independent unit reviews. They consistently disclose same-model independence and their verification boundaries. Onboarding reports 91 targeted tests; guided/worklets reports 21 plus mutation checks; preview/waveform reports 20; authentication reports another real `bun run test:auth` journey in its independent review. Those are the respective reviewers' executions, not new executions by this final reviewer.

I independently replayed the onboarding, guided, and waveform scoped diffs against their exact preserved baselines in memory using Python. I compared their reconstructed reviewed results with the current named files. I also compared all six auth files with `repository-followups-auth.final.json`. The comparison covered 21 named files and found exactly four single-line narrative-comment deletions, with every other byte matching the reconstructed or saved reviewed result.

- `apps/web/src/components/onboarding/onboarding.tsx` removed the entry-persistence narration.
- `apps/web/src/lib/practice-guided.test.ts` removed the sequential-transition narration.
- `apps/web/src/lib/recorder-worklet.test.ts` removed the conservation narration.
- `apps/backend/src/integration/auth-integration.ts` removed the migration-order narration.

The current executable code matches the reviewed snapshots. The reports correctly state that retained diffs and hash receipts precede these deletions. They must not be described as byte-identical snapshots of the current files. Suppression comments were retained. No comments were deleted or restored by this reviewer. There were no new constraint encodings, architecture sketches, or comment-review reruns.

## Final logs and remaining limits

The supplied final logs support successful root typecheck, lint, test, and build, plus the uncached worktree smoke task. Typecheck reports 10/10 tasks cached. Lint reports 8 successful with 6 cached. Test reports 251 backend, 370 web, and 8 worktree tests; backend and worktree results are cached replays. Build reports 6 successful with 4 cached. Smoke reports database schema, web, API health, CORS, and email preview success with no cached task. These are valid Turbo success receipts, not fresh execution of every check in every package.

The logs retain nonfatal circular-dependency, test-environment/canvas, and bundle-size warnings. No root checks, application tests, authentication journeys, or browser runs were repeated for this artifact-only review. The only independently executed check here was the read-only in-memory attribution comparison.

Remaining boundaries are accurately disclosed by the unit reviews. Synthetic lifecycle events do not prove actual BFCache traversal. Fixture voice does not prove live Gemini, physical microphone permissions/disposal, or audible output. Guided-history tests capture generation arguments rather than browser HTTP traffic and accept loss of older partner context. Waveform tests use a controlled RAF/canvas environment and do not cover the preexisting asynchronous microphone-acquisition path. Authentication runs production Hono in process with real PostgreSQL, but does not establish browser cookie enforcement/TLS or every signal/timeout/cleanup-failure path.

RI-008 is tracked as open static evidence in `repository-followups.findings.md:23-27`, with reproduction and assessment-policy decisions still pending. The cited code supports that status. `practice-live.ts:90-110` passes the full message collection to suggestions and `168-184` builds feedback history without a size bound; `packages/contracts/src/practice.ts:260-282,311-314` imposes transcript limits. No oversized actual request reproduction is claimed. RI-003 must not be described as resolving these consumers.

## Artifact reconciliation before handoff

The plan remains appropriately bounded to RI-001 through RI-007. Keep browser acceptance open until a corrected closure run is independently examined. Update the todo's stale in-progress unit-review and root-check entries to reflect their completed receipts, while retaining unfinished browser/final reconciliation entries. Remove the stale statement that combined repository checks remain pending in `repository-followups.findings.md:13`. The decision trail currently ends at design and should record the accepted units, final checks, and browser blockers before claiming the audit trail complete. The browser baseline document's unqualified statement that no execution blocker remains at line 33 should be scoped to that historical baseline.

No new application defect was established by this final review. The immediate blockers are in the browser proof and its closure result. Final acceptance can follow a corrected fresh-label run that passes exact persisted-turn and visible reload checks without unexpected errors, followed by ledger reconciliation.
# Superseding verification

This review observed an earlier browser runner and failing evidence. The coordinator corrected the complete-turn expectation and auxiliary request handling. The subsequent finished `repository-followups-browser.closure-final.json` passed. A fresh independent reviewer accepted the current runner and evidence in `repository-followups.closure-review.md`. The original findings below remain as the historical review record.
