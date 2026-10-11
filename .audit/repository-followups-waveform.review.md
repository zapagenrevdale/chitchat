# RI-005/006 independent review

Accept. No blocking findings in the scoped changes.

This is a separate same-model independent review. It makes no cross-model claim. I read the scoped diff, implementation report, all three current owned files and their three preserved baseline copies. I also read the preview hook to check what the tests exercise. No source files were edited and no nested agents were used.

throughput checkpoint: n/a, read-only investigation

## Correctness

- `apps/web/src/components/ui/live-waveform.tsx:110-240` gives processing and fading one effect-local nullable frame handle. Each callback updates that handle before scheduling its successor. Cleanup cancels the latest frame, including handle zero. State transitions clean up the previous effect before starting the replacement, so the old fade cannot clear newly active or processing data. The final fade clear requests a draw at lines 223-229.
- `apps/web/src/components/ui/live-waveform.tsx:347-350,424-430,524-542` gives the renderer separate frame ownership. Idle drawing stops after consuming invalidation. Active drawing recurs. Wake requests coalesce while a draw is pending. Cleanup removes the wake function and cancels the pending draw. Producer invalidation that occurs before renderer setup is preserved and the renderer requests an initial draw itself.
- `apps/web/src/components/ui/live-waveform.tsx:87-108` invalidates and wakes drawing after resizing the canvas. `apps/web/src/components/practice/live-waveform.test.tsx:119-135` checks a settled idle queue, two coalesced resize notifications, the new clear dimensions, exactly one additional clear, and a settled queue afterward.
- `apps/web/src/components/ui/live-waveform.tsx:244-251` keeps explicit null and borrowed analysers on the external-resource branch. It clears local visualization data without closing or disconnecting the borrowed resource. `apps/web/src/components/practice/live-waveform.test.tsx:199-267` exercises wakeup, sampling, analyser replacement, stop and ownership. Both active and processing flags still give the active sampler priority through the producer guard at line 112.
- `apps/web/src/components/practice/live-waveform.test.tsx:269-280` exercises StrictMode setup/cleanup replay followed by processing and unmount. Effect-local handles and wake cleanup avoid retaining a replayed loop. This covers the borrowed/null path used by these tests, not the separate pre-existing asynchronous microphone-acquisition path.

## Test strength

Test Behavior, Not Implementation guided the review of complete fixtures and observable effects. The waveform fixture executes the real component with a controlled canvas and RAF queue. It snapshots frame IDs, removes callbacks before invoking them, respects cancellation of another pending callback and defers new callbacks to the next frame at `apps/web/src/components/practice/live-waveform.test.tsx:30-42`. Its canvas counts bar drawing separately from edge-mask drawing at lines 52-72. Assertions check final clearing, queue exhaustion, no later drawing, restart cancellation, active sampling and borrowed-resource ownership. This is meaningful lifecycle coverage, not browser pixel proof.

The preview tests dispatch actual DOM events and settle controlled playback promises. Keeping replacement playback pending at `apps/web/src/components/practice/use-persona-preview.test.ts:124-147` makes a stale resolution observable as an incorrect loading-to-playing transition. The stop-only cases at lines 153-176 check both late resolution and rejection. The unmount cases at lines 178-211 check source release and absence of later media side effects. They correctly avoid claiming that React ignoring state updates after unmount proves listener removal.

Assertions in both test files execute in the test bodies after actions and awaited settlements. They are not inside production-caught playback callbacks or microphone setup. Production's catch at `apps/web/src/components/practice/use-persona-preview.ts:65-72` cannot swallow these assertions. The removed `onended === null` assertion did not establish removal of listeners installed through `addEventListener`.

## Comments and suppressions

Read `.opencode/skills/no-comments/SKILL.md` and inspected the scoped additions read-only. The only added comments are the two file-level `vitest/max-expects` exemptions at line 1 of the test files. They suppress an assertion-count style rule, not correctness, safety or TypeScript checking. Their rationale matches the multi-transition lifecycle cases. No blocking comment or suppression finding. The existing constructible Audio mock explanation and `prefer-arrow-callback` exemption were already in the preview baseline. No deletions, restorations, rewrites or encoding changes were made. Nested comment-review delegation was skipped under the explicit task restriction.

## Reproducible verification

Ran through root Turbo:

```sh
bun run test --filter=@chitchat/web -- src/components/practice/use-persona-preview.test.ts src/components/practice/live-waveform.test.tsx
```

The web test task was uncached. Both files passed, with 20 tests total. Dependency build and i18n tasks replayed cached results. No broad checks or browser checks ran in this review. The implementation report's earlier red run was not independently repeated because this review permits no source edits.
