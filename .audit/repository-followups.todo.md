# Repository follow-up checklist

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Ground all four units and compare designs.
- [x] RI-001. Recover onboarding after page suspension.
- [x] RI-002. Persist confirmed voice goals before transcript navigation.
- [x] RI-003. Bound guided-session requests.
- [x] RI-004. Verify worklet registration and recorder sample conservation.
- [x] RI-005. Replace ineffective preview lifecycle assertions.
- [x] RI-006. Settle and clean up waveform animation.
- [x] RI-007. Add and run real authentication integration.
- [x] Independently review each unit and fix accepted findings.
- [x] Phase D: Keep the audit trail.
- [x] Phase E: Verify and hand back.
- [x] Root typecheck, lint, test, build, and available runtime smoke checks.
- [x] Reconcile issue ledger and independent artifact review.

The concrete workflow and acceptance criteria are in `.audit/repository-followups.plan.md`.

Design coverage includes one pass per unit and an independent challenge pass over onboarding, guided history, and authentication isolation. A separate browser worker owns runtime reproduction artifacts. Backend and email development processes already belong to the user. Reuse them; only the missing web process was started for this run.

Chrome reproduced RI-001 and RI-002 before the fixes. The verified baseline runner exited 1 for disabled text controls and lost completed-goal persistence. Evidence is `.audit/repository-followups-browser.baseline-verified.json`. Lifecycle events are synthetic persisted events; provider responses and microphone samples are fixtures. Actual UI, voice controller, and audio worklets execute in Chrome.

RI-003/004 implementation passed 21 targeted tests and entered independent review. RI-005/006 implementation passed 20 targeted tests and entered independent review. Both units retained scoped baseline copies and diffs. Browser instrumentation review accepted the original reproduction but required stronger closure assertions; that correction is in progress before the final browser rerun.

All four root checks passed. The final suite reports 251 backend and 370 web tests. The worktree smoke task passed database schema, web, API health, CORS, and email-preview checks. Invoke that package task through `bunx --no-install turbo run worktree:smoke --filter=@chitchat/worktree`; the root has no `worktree:smoke` script. Onboarding independent review accepted all changes after rerunning 91 targeted tests. Its redundant narrative comment was removed afterward without changing executable code.

Closed locally. The strengthened Chrome runner passed in `repository-followups-browser.closure-final.json`. The initial artifact reviewer examined an earlier failing instrument version; a fresh independent review accepted the corrected runner and finished evidence in `repository-followups.closure-review.md`. All seven original issues are resolved. RI-008 remains separately tracked. Changes are uncommitted and preserve the dirty baseline.
