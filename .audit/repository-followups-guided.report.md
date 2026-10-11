# RI-003 and RI-004 implementation receipt

RI-003 is fixed at the request-history owner. RI-004 adds executable coverage of the actual shipped worklet scripts. Public worklet source was not changed.

## Design and scope

The coordinator supplied the independent design comparison and chose bounded recent history. Terminal stop would avoid overflowing the request but change indefinite practice into a capped session. Whole-exchange eviction preserves continued practice and the full UI transcript through existing onMessage callbacks.

PracticeGuided now stores GuidedExchange objects with a partner and optional completed user reply. Skips remain partner-only exchanges. The retained context is a chronological suffix bounded by message count and UTF-16 text size. IDs use an independent monotonically increasing counter. Retry, TTS reuse, skipped request flags and cumulative progress counters keep their existing lifecycle.

The existing schema limits are named in packages/contracts/src/practice.ts without changing validation semantics. The existing index wildcard export exposes them. Per-message text is already bounded more tightly by guidedTurnSchema at the API response boundary.

One important contract clarification emerged from an executed boundary test. The pinned Zod string .max() counts Unicode code points, while the aggregate refinement counts UTF-16 code units through text.length. Accordingly the shared names are messageCharacters and totalCodeUnits. The test exercises 8000 non-BMP characters per message and 60000 aggregate UTF-16 units at exact and one-over boundaries. No contract semantic change was made.

Source writes are limited to these five files.

- apps/web/src/lib/practice-guided.ts
- apps/web/src/lib/practice-guided.test.ts
- apps/web/src/lib/playback-worklet.test.ts
- apps/web/src/lib/recorder-worklet.test.ts, new
- packages/contracts/src/practice.ts

Baseline copies are in .audit/repository-followups-guided.before/. The comparison against those copies is .audit/repository-followups-guided.diff. Existing dirty contract changes were preserved. No commits, nested agents or UI edits were made.

## Evidence

The baseline failed all four initial long-session scenarios with real guidedTurnRequestSchema validation returning false. Those assertions run on arguments actually supplied by PracticeGuided to generateGuidedTurn, outside the API mock implementation and production catches. The transport remains mocked to drive deterministic long sessions. See .audit/repository-followups-guided.red.log.

The final targeted run passes 21 tests across three files. Scenarios include 160 short completed exchanges, 80 maximum-length exchanges, 310 skips, 320 mixed exchanges and 80 non-BMP exchanges. Every iterative generation request is validated against the real schema and compared with the expected whole chronological suffix. Tests also verify monotonically increasing UI IDs, cumulative counters, post-eviction generation failure, TTS failure and successful retry without duplication. The existing lifecycle regressions remain.

Recorder coverage executes public/audio/recorder.worklet.js with node:vm. At 44100 and 48000 Hz, tests feed 128-sample blocks and short final blocks, assert the emitted prefix, feed the remaining samples to complete the pending buffer, and compare the full ordered stream. structuredClone transfers detach the actual source buffers. Both worklet registration names are checked exactly. Existing playback sample and lifecycle tests remain intact.

The mutation receipt executes the real source and in-memory variants. Wrong registration names are rejected for both worklets; losing the first sample of each recorder block is rejected at both rates. It never writes public source. Rerun with node .audit/repository-followups-guided.mutations.mjs. See .audit/repository-followups-guided.mutations.log.

## Commands and results

- bun run test --filter=@chitchat/web -- src/lib/practice-guided.test.ts src/lib/playback-worklet.test.ts src/lib/recorder-worklet.test.ts. Passed 21 tests. Receipt .audit/repository-followups-guided.green.log.
- bun run typecheck --filter=@chitchat/web --filter=@chitchat/contracts. Passed. Receipt .audit/repository-followups-guided.typecheck.log. An earlier concurrent run was blocked by a live-waveform test error outside this unit; the final run passes.
- bun run lint --filter=@chitchat/web -- src/lib/practice-guided.ts src/lib/practice-guided.test.ts src/lib/playback-worklet.test.ts src/lib/recorder-worklet.test.ts. Passed. Receipt .audit/repository-followups-guided.lint-web.log.
- bun run lint --filter=@chitchat/contracts -- src/practice.ts. Passed. Receipt .audit/repository-followups-guided.lint-contracts.log.
- node .audit/repository-followups-guided.mutations.mjs. Passed all baseline and mutation checks.

Formatting was scoped to the owned web files. Full repository checks and independent review remain with the coordinator.

Model the Domain shaped the explicit exchange structure. Laziness Protocol kept eviction and IDs local rather than introducing a context service. Test Behavior shaped assertions on actual request arguments, UI messages and conserved samples. Prove It Works required the red overflow reproduction, shipped-script execution and mutation receipts.
# Post-review correction

The coordinator removed the two redundant narrative comments identified by independent review from `practice-guided.test.ts` and `recorder-worklet.test.ts`. No executable statements changed. The saved implementation diff precedes those comment deletions. Scoped `git diff --check` passed afterward; combined final checks remain pending.
