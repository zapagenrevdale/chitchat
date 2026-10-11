# Repository improvement

Exit condition. Assess backend, frontend, and test quality against the current working tree. Implement the highest-value bounded improvements supported by those findings. Run all four root checks and obtain independent review, recording any genuine blockers.

Orchestrate step 1 collapses this first pass to an autonomous run. The scope is one session, with three read-only audit partitions followed by scoped writers and independent review.

- [x] State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N PRs merged, pixel-diff zero).
- [x] Pick the wake mechanism using Claude Code's `loop` skill (a built-in, not a pstack skill). An event to watch (CI, a merge, a ref advancing) gets a watcher subagent that wakes you on the event, with a long time-based heartbeat as fallback. No event gets a fixed-interval heartbeat sized to when the result is worth re-checking.
  skip: This runtime supplies background completion notifications, but no loop tool. Use those notifications.
- [x] Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, discards changes that didn't help. Belt-and-suspenders that "might help" gets reverted, not left to ride.
  Commits deferred because the baseline contains substantial overlapping user work.
- [x] Mid-run discoveries are yours. Address broken skills, related bugs, flaky verifiers, review noise, tooling failures, orphaned follow-ups, and fixable drift yourself via poteto-mode. Put out-of-band fixes in their own PR. Do not park reversible work for the human or use `AskUserQuestion`. Surface only irreversible actions, genuine product or preference calls no experiment can settle, or a real dead end. Keep the predicate as the main drive, and return to it after each side fix.
- [x] Checkpoint every iteration via the **show-me-your-work** skill, a row for what changed and whether the predicate moved.
- [x] Stop when the predicate is met. A plateau is not a stop, so keep going and pivot your approach to push past it. Surface a genuine dead end rather than spinning, and never relax the predicate to declare victory.

## Audit coverage

- [x] Frame.
- [x] Fan out.
- [x] Aggregate.
- [x] Report.
- [x] Backend and shared contracts audit.
- [x] Frontend state and boundary audit.
- [x] Test quality and tooling audit.
- [x] Scoped improvements.
- [x] Root checks and independent review.

Throughput checkpoint. Read-only audits can run concurrently. Writing starts after findings are consolidated, with exclusive file ownership. The main constraints are preserving overlapping user changes and testing real behavior without external AI credentials.

## Bounded design

- [x] Ground.
- [x] Sketch.
  Two independent backend design passes compared local fixes with shared budget constants and locale-aware eligibility APIs.
- [x] Agree.
  Local fixes preserve signatures. Optional captions retain the original total deadline and nullable wire contract.
- [x] Implement.
- [x] Scrap.
  skip: No evidence requires replacing the existing architecture.

Writer ownership is disjoint. Audio owns practice-audio source and tests. Backend owns feedback, routes, transcription tests, and a transcript-budget regression test. Tooling owns turbo.json and the web package script.

## Unit verification

- [x] Audio cancellation reproduced, repaired, and independently reviewed.
- [x] Tooling cache-input proof completed. Disproven DB output change removed.
- [x] Tooling independent review.
  Tooling passed. Removed a model-selection explanation that the artifact-only reviewer could not independently substantiate.
- [x] Backend regression reproduction, repairs, and independent review.
  BR-001 resolved. A fresh independent reviewer accepted the externalized assertions and six-case mutation proof.
- [x] Final root checks.
  Root typecheck, lint, test, and build passed. Final test logs report 251 backend, 331 web, and 8 worktree tests.
- [x] Trail review and final assessment.
  Artifact-based independent review completed. No cross-model or full-transcript review claimed. All dispatched agents returned terminal reports. No source writer or verification process remains active for this task.
