# Follow-up findings and verdicts

## Verification scope

The active plan covers RI-001 through RI-007. Each implementation unit receives independent review before closure. Browser baseline evidence confirms RI-001 and RI-002 using synthetic persisted lifecycle events and provider fixtures in Chrome. This does not establish live Gemini behavior or actual back-forward cache restoration.

## Accepted units

RI-001 and RI-002 passed independent source and test review with 91 targeted tests. Text recovery preserves retryable input and confirmed results across lifecycle events. Voice recovery exposes Restart for interrupted sessions, retains Continue for completed sessions, and saves confirmed goals before transcript navigation. The strengthened Chrome runner passed with no failures or unexpected errors in `.audit/repository-followups-browser.closure-final.json`. It verifies a new retry POST, exact saved completed turn, open transcript, and the expected rendered benefits after reload. Source review is `.audit/repository-followups-onboarding.review.md`.

RI-003 and RI-004 passed independent review. All 21 targeted tests and the in-memory worklet mutation checks passed again. Guided generation retains complete recent exchanges within the unchanged contract while preserving emitted messages, stable IDs, and cumulative counters. The actual recorder script conserves samples at 44.1 and 48 kHz. Both registration names are verified. The reviewer identified two redundant test comments, which were removed without behavioral changes. Evidence is `.audit/repository-followups-guided.review.md` and `.audit/repository-followups-guided.report.md`.

RI-005 and RI-006 passed independent review with no blocking findings. The reviewer reran all 20 targeted tests. Preview assertions now exercise real event listeners and deferred playback. Waveform tests reproduce idle scheduling, fade cleanup, and final-clear failures before the production correction. The corrected implementation settles idle and cancels its owned frame handles. Evidence is `.audit/repository-followups-waveform.review.md` and `.audit/repository-followups-waveform.report.md`.

RI-007 passed independent review and another real PostgreSQL run of `bun run test:auth`. The uncached task exercises production Better Auth, Prisma, signup, signin, cookie-authenticated access, signout, and rejection when replaying a revoked cookie. Each run owns a separate database. Concurrent-run, failure-cleanup, and cookie-removal mutation evidence is retained, with its limits detailed in `.audit/repository-followups-auth.review.md`.

## Combined checks

Final independent artifact acceptance is `.audit/repository-followups.closure-review.md`. It reconciles the stale earlier artifact verdict against the corrected runner and completed Chrome evidence. All seven original follow-ups are closed locally. No commit or PR was created. Reviews are independent same-model sessions, not cross-model review. Actual BFCache traversal, physical microphone permission behavior, and live Gemini remain outside the verification evidence.

Root typecheck, lint, test, and build passed. The suite reports 251 backend, 370 web, and 8 worktree tests. Logs are `.audit/repository-followups.final-{typecheck,lint,test,build}.log`. The uncached worktree smoke task passed database schema, web, API health, CORS, and email preview checks. Its log is `.audit/repository-followups.final-smoke.log`. Four redundant comments were removed after their respective reviews; those changes do not alter executable code. Earlier scoped diffs retain the original comments.

## Newly observed issue

| ID | Status | Finding | Evidence | Next verification |
| --- | --- | --- | --- | --- |
| RI-008 | Open, static evidence | Free-mode reply suggestions and feedback also send unbounded histories. Guided-session context bounds do not resolve these separate consumers. | `apps/web/src/lib/practice-live.ts:90-110,168-184`; transcript limits in `packages/contracts/src/practice.ts` | Reproduce oversized actual suggestion and feedback requests. Decide how assessment represents omitted earlier turns before choosing a bounded-history policy. |

RI-008 was discovered while designing RI-003. It is tracked separately because truncating an assessment changes what the assessment claims to cover. The current guided-session repair preserves its existing cumulative recap and does not request that assessment.
