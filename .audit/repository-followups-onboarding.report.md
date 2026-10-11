# RI-001 and RI-002 implementation receipt

Baseline captured at 2026-10-11T03:48:40Z. Red run began at 03:51:31Z. Final 91-test run began at 03:54:51Z. Web typecheck and scoped lint were green before the final verification timestamp of 03:56:19Z.

## Changes relative to the dirty baseline

- `use-onboarding-goal.ts` invalidates the active controller before aborting. Page suspension restores confirmed history and idle state. Accepted terminal turns retain pending navigation for one persisted pageshow. Reset and unmount clear it. Both late replies and reading timers are identity/abort guarded.
- `use-onboarding-live.ts` adds the hook-local interrupted phase. Page suspension closes and invalidates the controller. Incomplete work needs explicit Restart; completed work stays ready. Identity-guarded completion publishes a narrowed ready/choose turn through `onResolved` once per attempt. Transcript pause keeps the existing controller.
- `onboarding-conversation.tsx` passes acceptance separately from navigation and reuses the existing Restart action for interrupted work. Existing button variants and classes remain intact.
- `onboarding.tsx` separates `acceptGoal` from `advanceGoal`. A synchronous `commitDraft` path merges against the latest ref-backed draft, updates React state, and saves immediately. All existing mutations use this path, so batched finalized transcript and completion cannot save a render-captured draft. The remaining entry effect saves the latest ref once per editing-boundary change rather than racing every draft change. Editing with `onCancel` performs no draft writes. Storage failures still surface feedback.
- `onboarding-recovery.test.tsx` adds 16 integration cases using the real component, hooks, network adapter, storage writer, and storage reader. Only the live controller and fetch boundary are mocked; scrolling is stubbed for jsdom. Coverage includes pending-text recovery, clarification delay, terminal third turns, stale callbacks, mode replacement, interrupted active phases, same-session transcript pause, immediate raw-storage persistence, duplicate completion, reload, ready suspension, blocked storage, and editing boundaries.
- Existing hook and component tests now provide `onResolved`. The transcript-open fixture expects normalized saved state to restore benefits while the current UI still waits for Continue.

No storage implementation or storage tests required changes.

## Evidence

`repository-followups-onboarding.red.log` prints 10 failed and 5 passed. Eight failures demonstrate the intended defects. Text input remained disabled after suspension; the ready third-turn test could not find the benefits heading; four active voice phases could not find Restart voice; synchronous ready completion stored an empty conversation and motivation without a resolved goal. The two initial choose cases used invalid fixtures with nonempty goals/skills and are excluded from defect evidence. They were corrected to the contract's empty goal/skills and pass in the final suite.

`repository-followups-onboarding.green.log` records 7 files and 91 tests passed using:

```sh
bun run test --filter=@chitchat/web -- --run src/components/onboarding src/lib/onboarding-storage.test.ts
```

`repository-followups-onboarding.typecheck.log` records successful `bun run typecheck --filter=@chitchat/web`.

`repository-followups-onboarding.lint.log` records successful root Turbo scoped lint for all seven changed files. `git diff --check` passed for onboarding. The final test mock annotation was corrected after the 91-test run to use the controller's `AnalyserNode | undefined` return type; the hook already normalizes absent analysers to null. Typecheck and lint ran after that correction.

## Baseline and attribution

- `repository-followups-onboarding.baseline-status.txt` captures the original dirty checkout status.
- `repository-followups-onboarding.baseline.diff` captures the original scoped git diff.
- `repository-followups-onboarding.baseline.tar.gz` holds original onboarding files and storage sources.
- `repository-followups-onboarding.scoped.diff` compares final source files against those original bytes, including the new integration file.
- `repository-followups-onboarding.receipts.tsv` lists baseline and final SHA-256 values for the seven changed files.

## Remaining verification boundaries

The integration suite dispatches lifecycle events in jsdom. Browser BFCache traversal, real microphone disposal, and independent review remain with the parent session. No online provider calls, commits, configuration edits, nested agents, or new UI design were performed.

Model the Domain shaped the explicit interrupted phase and separate pending-navigation state. Laziness Protocol kept the fix within existing hooks and one parent mutation path. Test Behavior shaped assertions on usable controls and raw persisted values. Prove It Works required dirty-baseline attribution and recorded red/green output rather than typecheck alone.
# Post-review correction

Independent review accepted the implementation. The coordinator removed its one flagged narrative comment about entry persistence from `onboarding.tsx`. Executable code is unchanged. The preserved scoped diff and hash receipts precede this comment deletion.
