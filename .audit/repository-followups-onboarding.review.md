# RI-001 and RI-002 independent review

Verdict: ACCEPT. No concrete functional blocker found in the scoped changes.

Independent same-model review by GPT-6 Astra. No source edits or nested agents. The private scratchpad was never accessed. Only this review artifact was authored.

## Scope and attribution

Read `repository-followups-onboarding.scoped.diff`, the implementation report, the changed source and tests, and the storage and live-controller boundaries. Rebuilt the unified diff in memory using the exact seven named current files and their entries in `repository-followups-onboarding.baseline.tar.gz`. It matches the supplied scoped diff byte for byte. This verifies attribution against the dirty baseline rather than Git HEAD.

The reviewed state consists of confirmed text history, an active text controller, one pending terminal navigation, a disposable voice controller, a completed-attempt flag, and a ref-backed persisted draft.

Throughput checkpoint: n/a, read-only investigation. The requested review report replaces a separate checklist. Delegated investigation and comment-review steps were skipped because nested agents are prohibited.

## Findings

No blocker with a supported reproduction was found.

- Text suspension invalidates before aborting, restores confirmed history, and returns the input to idle. Retry retains the answer held in the parent draft. Late aborted replies cannot update history or navigate. See `use-onboarding-goal.ts:51-82,94-145` and `onboarding-recovery.test.tsx:157-219`.
- A confirmed clarification remains in history after its reading delay is aborted. Terminal ready and choose results have a separate pending navigation, so the third-turn history limit does not prevent restoration. Persisted pageshow consumes the pending value before calling the parent. The normal timer also consumes it before navigation. Reset and unmount clear it. See `use-onboarding-goal.ts:56-99,127-136`.
- Voice page suspension closes and invalidates the controller, then selects interrupted or ready from the synchronous completion flag. Restoring the page does not start a microphone session. Restart replaces the attempt explicitly. Transcript pause and resume retain the existing session. See `use-onboarding-live.ts:48-63,80-100,110-136` and `onboarding-conversation.tsx:305-350`.
- A terminal voice result held in the open transcript retains Continue after suspension. Duplicate completion, later phase changes, and later errors cannot replace an accepted result. Old controllers fail the identity guard. The real controller publishes confirmed transcript before completion and closes before invoking completion, so the mock callback sequence matches that boundary. See `use-onboarding-live.ts:68-97` and `apps/web/src/lib/onboarding-live.ts:460-474,660-683,743-755`.
- Draft mutation merges against `currentDraft.current` and writes storage synchronously. Batched finalized transcript and completion therefore retain both updates before React commits. Acceptance persists the result without prematurely navigating the open transcript. Reload normalization then resumes benefits or skills. See `onboarding.tsx:226-269,435-441` and `apps/web/src/lib/onboarding-storage.ts:27-40,129-138`.
- Mode switch, Restart, back, and manual skills pass through attempt invalidation. Text pending navigation is cleared; old voice parent callbacks retain the old attempt ID and cannot mutate the new draft. Manual skills clears the accepted result. See `onboarding.tsx:305-381`.
- Editing with `onCancel` bypasses both synchronous and entry-effect draft writes. Blocked storage returns false and exposes existing progress feedback while navigation remains usable. See `onboarding.tsx:226-232,290-296` and `onboarding-recovery.test.tsx:377-402`.

Source references above are relative to `apps/web/src/components/onboarding/` unless a full repository path is given.

## Test quality and executed verification

Ran the root Turbo command independently:

```sh
bun run test --filter=@chitchat/web -- --run src/components/onboarding src/lib/onboarding-storage.test.ts
```

Result: 7 files and 91 tests passed, including 16 recovery integration cases. The run emitted React act-environment and jsdom canvas warnings. No typecheck, lint, build, real-browser traversal, provider request, or physical microphone check was run by this reviewer.

The new integration suite mounts the real Onboarding component and both real hooks. It uses the real network adapter, schema-valid response fixtures, storage writer, and storage reader. It mocks fetch and the live-controller boundary. Assertions check usable controls, request history, raw stored data, reload destinations, and absence of stale results. The immediate persistence assertions execute after direct callback invocations inside `act`, not inside callbacks caught by application code. Assertion failures therefore propagate to the runner.

The third-turn restoration test checks navigation after repeated pageshow and timer expiry. It also checks that another pageshow cannot move a learner backward from skills. It does not count every navigation callback invocation; exactly-once consumption is additionally supported by the source guards. Existing hook tests count the normal terminal navigation exactly once.

Back and manual-skills invalidation are supported by source inspection and existing tests. The new real-hook integration suite does not add every combination of those controls with suspension and late callbacks. This is a coverage limitation, not evidence of a defect.

Actual browser BFCache traversal and physical microphone disposal remain untested. Synthetic jsdom lifecycle dispatch and a mocked controller cannot establish either behavior.

## Comments and suppressions

Applied the loaded no-comments skill and its comment-sicko rubric directly within the read-only scope. No nested reviewer was spawned. No comments were deleted or restored, and no suppression was added by this reviewer.

- Nonblocking cleanup flag under that rubric. `onboarding.tsx:292` adds narration about entry persistence and synchronous mutations. The code already expresses it. Remove that prose comment when applying comment cleanup.
- `onboarding.tsx:293` retains the baseline `react/set-state-in-effect` suppression for reporting the external storage write result. The scoped change narrows execution to entry and editing-boundary changes. I found no hidden correctness regression from this suppression.
- The reading-delay Promise suppression and transcript scrolling suppressions are unchanged from the archived baseline. The new integration file introduces no lint or TypeScript suppressions. No new safety or correctness suppression was found in the scoped diff.

Test Behavior, Not Implementation shaped the decision to inspect the complete integration setup, raw-storage assertions, callback exception boundaries, and observable navigation rather than accepting mocked-hook test success alone.
