# Browser instrumentation review

The recorded baseline reproduces RI-001 and RI-002. The current runner is useful regression evidence, but its passing exit code is not sufficient to close both issues. Strengthen the checks below before using a green rerun as the closure gate.

This is an independent, read-only instrumentation review of `repository-followups-browser.ts`, `repository-followups-browser.voice.js`, `repository-followups-browser.md`, and `repository-followups-browser.baseline-verified.json`, all under `.audit/`. Only this review file was written. No browser was run, no source was changed, and no nested agents were used.

Throughput checkpoint is n/a for this read-only investigation. The Investigation and comment-review workflows were applied directly within the assigned scope. Their delegation steps were skipped under the explicit no-nested-agents instruction. Test Behavior, Not Implementation shaped the review of each full fixture and assertion against the defect it must detect.

## Baseline is a behavioral failure

- The JSON has no `blocker` and contains all three intended failures at lines 842-845. The runner assigns exit code 1 for that result at TS lines 116-122. This corroborates the documented exit classification, although the JSON does not independently record the process exit status.
- RI-001 starts with the seeded motivation in an enabled textarea, records the actual onboarding POST payload, then captures the same textarea disabled both pending and after lifecycle events. See JSON lines 342-347 and 646-755. The only recorded error is a canceled fetch with `net::ERR_ABORTED` at lines 6-13. All five document responses are HTTP 200. This is not a missing form, failed navigation, or missing POST setup error.
- RI-002 reaches the visible completed transcript, enabled Continue button, and Back to voice control. The completion endpoint fixture records the expected goal and user transcript. The saved draft has both transcript turns but no resolved goal, empty motivation, and `step: microphone`. Reload shows Restart voice and an empty transcript. See JSON lines 756-840. A provider setup failure would not explain that completed state.
- I parsed the saved JSON with Bun and checked these fields independently. No application tests, lint, typecheck, build, or new browser execution ran for this review.

## Closure blockers

### RI-002 accepts the wrong persisted result and does not assert the restored UI

TS line 107 accepts any truthy `resolvedGoal`. Line 113 accepts only a localStorage `step` equal to `benefits`. Neither checks that the saved goal matches `voiceProviderFixture.outcome`, that the goal survives reload, or that the benefits screen actually renders. A wrong truthy goal and a benefits step persisted before a rendering failure can pass both checks.

Check the persisted goal fields against the explicit fixture outcome before and after reload. After reload, wait for an identifying benefits UI state and assert its expected content. Keep the storage check as separate persistence evidence. A stored step alone does not establish that reload reached benefits.

### RI-002 does not assert that completion keeps the transcript open

TS lines 100-101 open the transcript and wait for a log before sending completion. Lines 103-107 then wait only for a Continue button and inspect storage. If completion closes the transcript while persisting the result, the current checks can still pass. Snapshot data also omits `aria-expanded`, and a generic log's existence does not prove visibility.

Assert the transcript's open and visible state at completion and at the pre-reload persistence snapshot. Assert the expected user and assistant turns and the completed Continue control. The baseline contains these observations, but the runner does not enforce them on subsequent runs.

### RI-001 only checks an enabled textarea

TS line 89 accepts any enabled textarea on the page. The pending snapshot is not asserted, cancellation is not asserted, and the recovered Continue control and ability to submit again are not checked. A change that only removes the textarea's disabled attribute while leaving submission locked passes. A page with an unrelated enabled textarea can also pass.

Scope the assertion to the onboarding form. Assert its pending disabled state, then recovery of the relevant controls. For a claim of usable recovery, submit another turn and observe a new intercepted POST. Correlate the cancellation with the held request if cancellation is part of the claimed contract. The baseline itself has the correct disabled-state sequence, so this gap does not invalidate the original reproduction.

## Timing and exception handling

- `evaluate` throws on JavaScript evaluation exceptions, CDP calls have timeouts, and missing POST/socket/log/Continue prerequisites fail through the blocker path. These are useful protections against setup failures being counted as regression assertions.
- Navigation readiness uses `document.readyState` and fixed sleeps, including the reload at TS lines 109-112. These do not bind readiness to the new document or React's restored UI. Await a new document/load signal and the target UI condition. Fixed sleeps can produce timing-dependent failures, and the weak stored-step check can pass before the new UI is verified.
- Page runtime exceptions, log errors, and network failures are collected at TS lines 31-34 but never affect exit status. An unexpected runtime error alongside matching storage flags can therefore produce exit code 0. Classify expected cancellation separately and fail or explicitly report unexpected errors as a blocker. The baseline has only the expected cancellation, so this concern is prospective.
- The initial port-file read, target creation, and WebSocket connection happen outside the `try` at TS lines 4-7. Setup failures there bypass the documented exit-code-2/report path, and the socket-open wait has no timeout. The blanket exit-code description in MD line 11 is consequently stronger than the implementation. Put those operations under the reporting boundary or narrow the documentation.
- Empty catches at TS lines 128 and 130-131 are confined to diagnostic snapshot and cleanup attempts. They do not erase a primary failure. They can hide cleanup failures, so they are not proof that interception was fully cleaned up. This is not a baseline blocker.

## Fixture limits and comments

The synthetic persisted pagehide/pageshow sequence tests the application's lifecycle handlers in Chrome. It does not test actual BFCache eligibility, freezing, navigation, or restoration. TS line 88 and MD line 15 disclose this accurately. The simultaneous event dispatch also gives the application no real suspended interval.

The voice fixture replaces token/completion fetches, Gemini WebSocket transport, and microphone capture. It sends a ready outcome, a tool response follow-up, transcription, and silent PCM. This is an acceptable deterministic boundary for browser-side completion persistence. It does not validate provider authentication, tool-schema compliance, network retries, hardware audio, or real microphone permissions. The fixture never writes onboarding storage directly, so persistence still depends on the application under test.

The fixture records endpoint calls but does not assert their count or payload. Its fetch matching assumes a string URL and an options object. A future Request-based call can bypass it and try the real endpoint. A strict fixture should reject an unmatched onboarding/provider operation rather than fall through. The baseline's captured calls show that both intended fetch fixtures were used in this run.

No code comments, lint suppressions, or TypeScript suppressions appear in the two scripts. There are no comment deletions or suppression cleanups to request. The synthetic lifecycle and fake-provider descriptions are appropriately qualified. MD line 26's baseline-failure statement agrees with the saved evidence. TS line 114 and MD line 17 describe actual audio worklets running, but the saved assertions do not independently establish worklet execution or audible playback. Treat that as a method description, not separately verified audio coverage.

The concrete follow-up belongs to the instrumentation owner. Tighten the closure predicates and reporting boundary, then rerun serially against the implementation workers' completed changes. The current baseline remains valid evidence of the two original failures.
