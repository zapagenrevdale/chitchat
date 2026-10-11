# Independent review of RI-003 and RI-004

Accepted. No correctness or coverage blocker found in the supplied change. Two nonblocking comment-cleanup findings appear below.

This is a fresh reviewer session using OpenAI GPT-6 Astra, `openai/gpt-6-astra`. It did not implement the change. Treat this as same-model session independence, not model or provider diversity. No nested agents ran. Source files were read-only. This review is the only authored artifact.

Throughput checkpoint is not applicable to this read-only investigation. I read the supplied report, diff, actual sources, baseline copies, red receipt, mutation script, project model adaptations, and no-comments instructions. The no-comments delegation and editing steps were skipped under the explicit no-nested-agents and read-only scope. Prove It Works shaped the decision to rerun the targeted tests and mutations rather than accept the implementation receipt alone.

## RI-003 evidence

- `apps/web/src/lib/practice-guided.ts:36-39,141-165` represents a partner and optional completed user reply as one exchange. The reverse scan sums both message count and UTF-16 text lengths. On the first excess it removes that entire exchange and every older exchange. This retains the maximal whole chronological suffix under both limits. Adding a reply cannot leave its older partner behind. Skips create partner-only exchanges.
- `practice-guided.ts:193-202` flattens that retained history into the actual generation argument. `apps/web/src/lib/practice-api.ts:189-194,50-58` forwards the body directly into JSON serialization. Tests capture the argument at this API function boundary, not an actual HTTP request. That boundary is sufficient for this history-owner change.
- `apps/web/src/lib/practice-guided.test.ts:240-324` crosses the count limit with 160 completed short exchanges and 310 skips, and the text limit with 80 maximum-length exchanges, 320 mixed exchanges, and 80 non-BMP exchanges. Every iterative captured request passes the real schema and equals the independently calculated oldest-first eviction result at lines 76-93. The oracle uses fixed contract limits rather than importing the implementation's constants.
- The assertions at `practice-guided.test.ts:300-307,331-357` run after the awaited transitions, outside production catches and mock implementations. They cannot be swallowed by `advance()` or `start()`. The earlier red receipt at `.audit/repository-followups-guided.red.log:34-50` records all four original overflow cases failing specifically with expected `true`, received `false`, on schema validation of the captured argument. I inspected that receipt but did not recreate the red run by replacing source files.
- `practice-guided.ts:142-143,166-170` keeps IDs independent of eviction and emits every message. The tests assert the full contiguous ID sequence and message count at lines 311-316. `apps/web/src/components/practice/use-practice.ts:82-87,132` retains every nonempty message and updates only matching IDs. With monotonic IDs, eviction cannot overwrite old UI entries. Full transcript retention is supported by the callback test plus this UI-owner source inspection. No browser session was run.
- `practice-guided.test.ts:325-360` exercises generation failure, subsequent TTS failure, and successful retry after eviction in each long-session scenario. It checks identical retry requests, no duplicate messages, no extra generation during TTS retry, the next monotonic ID, and cumulative completed/skipped counters. `practice-guided.ts:321-363` retains the existing completion, skip, retry, and generation lifecycle.

## Contract semantics

`packages/contracts/src/practice.ts:260-282` only names the existing numeric limits. Comparison with `.audit/repository-followups-guided.before/packages/contracts/src/practice.ts:260-276` confirms unchanged validation expressions and values, including unique nonnegative IDs.

The exact per-message string limit is 8000 Unicode code points, not graphemes or UTF-16 units. The installed dependency proves this in `packages/contracts/node_modules/zod/v4/core/checks.js:265-274`. The aggregate refinement still uses JavaScript `text.length`, so its limit is 60000 UTF-16 code units. The passing tests at `practice-guided.test.ts:371-413` exercise 300 versus 301 messages, 8000 emoji versus an extra ASCII character, and exactly 60000 aggregate units versus 60001.

`practice-api.ts:193` parses generated turns using `guidedTurnSchema`. That schema bounds partner text to 600 code points and replies to 240 at `practice.ts:373-376`. Consequently a valid exchange is at most 1680 UTF-16 units and cannot evict itself as an oversized newest exchange.

## RI-004 evidence

- `apps/web/src/lib/recorder-worklet.test.ts:16-35` evaluates the actual public recorder script in `node:vm` and checks the exact single registration name. Its `structuredClone` uses the supplied transfer list and verifies source `byteLength` becomes zero. A missing or incorrect transfer cannot silently pass.
- At both 44100 and 48000 Hz, lines 43-80 feed unique ordered samples in 128-sample blocks with short final blocks. They assert exactly three full chunks and their complete ordered prefix, retain 73 pending samples through empty input, then fill the remainder and compare all four chunks with the original full stream. Loss, duplication, reordering, early remainder emission, and reset of the pending remainder are observable failures.
- `apps/web/src/lib/playback-worklet.test.ts:14-39` evaluates the shipped playback script and checks exactly `practice-speaker`. Existing tests at lines 59-162 still check sample conservation, buffering, interrupted generations, drain timing, and backlog bounds. The recorder assertions execute synchronously without a production catch around `postMessage`.
- `.audit/repository-followups-guided.mutations.mjs:34-42` first passes the unmodified scripts, then rejects wrong registration names for both scripts and removal of the first sample from every recorder input block at both rates. It requires `AssertionError`, so an arbitrary runtime exception cannot satisfy the mutation check. I reran it successfully. These are meaningful in-memory behavior mutations. They use a separate audit assertion runner, not a claim that Vitest itself was rerun against modified public files.

## Comment and suppression review

The diff introduces two narrative comments that repeat the test structure and qualify for deletion under no-comments. `apps/web/src/lib/practice-guided.test.ts:3` describes sequential transitions already expressed by awaited calls. `apps/web/src/lib/recorder-worklet.test.ts:1` repeats the conservation test's name and assertions. These are nonblocking style findings, left untouched under the read-only instruction.

The introduced suppressions are `vitest/max-expects` in both test files and `no-await-in-loop` in the guided test. They waive assertion-count style and loop-parallelization guidance. Sequential session transitions are required here. No introduced TypeScript, correctness, or safety suppression was found. No new production comments appear. Existing comments and suppressions were distinguished from additions using the baseline diff.

Comment deletions, restorations, reruns, architecture sketches, and encodings all total zero. No constraint-encoding offer is needed. The two narrative-comment findings remain open for the owner.

## Independent checks

- `bun run test --filter=@chitchat/web -- src/lib/practice-guided.test.ts src/lib/playback-worklet.test.ts src/lib/recorder-worklet.test.ts` passed all 21 tests across three files. The web test task executed with a cache miss. Its dependency build and i18n tasks replayed cached results.
- `node .audit/repository-followups-guided.mutations.mjs` passed both recorder-rate baselines, their registration and sample-loss mutations, and playback registration baseline/mutation.
- A read-only Python unified-diff comparison confirmed that all five actual source files exactly match the supplied diff against the baseline copies.

No broad checks, independent lint run, or independent typecheck run were performed. The implementation receipt's additional checks remain its claims, not this review's executions.
