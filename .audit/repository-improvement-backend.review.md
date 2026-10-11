# Backend independent review

ISSUES. The production changes satisfy the bounded requirements I inspected. One cancellation-test assertion can be swallowed by the route under test and needs to move outside the provider callback.

## Finding

### BR-001. Cancellation assertions can pass when propagation is broken

Priority P2. `apps/backend/src/practice/transcription.test.ts:170-182`, especially line 178, asserts `signal.aborted` inside the mocked caption provider. `apps/backend/src/practice/routes.ts:527-535` catches any error from that provider and converts it to `transcriptionToken: null`. An assertion failure therefore becomes the response the test expects. The client-cancellation rows still get their expected 502 through the final raw-request abort check.

I confirmed the failure mode without changing source files. A Bun diagnostic imported the actual route and replaced only the second `AbortSignal.any` result with an unconnected signal in memory. It used the same six cancellation cases and an equivalent Node assertion inside the provider. All six assertions threw, the route swallowed all six, and all six response expectations still passed. The timeout calls and provider invocation still occurred. This was a diagnostic of the actual route, not a rerun of mutated Vitest source.

The risk is an undetected regression in forwarding the deadline, caption cap, or client cancellation to the caption provider. Capture the supplied signal and assert its aborted state after awaiting the response, outside the route's catch boundary. Keep the rejection and late-token cases. The current production signal composition is correct on inspection.

## Passing checks

- The saved scoped diff exactly equals a freshly generated comparison of the four baseline snapshots against the current files, plus the new `transcript-body-budget.test.ts`. A separate HEAD-to-baseline comparison confirmed that `routes.ts` already contained the onboarding routes, onboarding byte limits, and `providerErrorStatus` changes. The scoped repair preserves those dirty-baseline edits.
- `feedback.ts:8,17-37` replaces whitespace counting with word-like `Intl.Segmenter` segments. It preserves blank-message skipping, adjacent-speaker turn grouping, three user turns, two partner turns, and twenty user words. Assessment instructions and final score validation are untouched. Japanese, Chinese, and Thai positives exercise the endpoint at `feedback.test.ts:173-189`. Short multilingual input, punctuation, and grouped chunks remain insufficient at lines 112-154.
- `feedback.test.ts:137-143,207-221` now observes the actual `assessConversation` operation for insufficient, invalid, foreign-origin, and oversized input. The removed empty-transcript test remains covered by the parameterized empty case. Positive tests check the assessor payload and HTTP response at lines 156-189.
- `routes.ts:78-100` applies a finite 524,288-byte limit to `/feedback`, `/reply-suggestions`, and `/guided-turns`. Their schemas retain the 300-message, 8,000-unit per-message, and 60,000-unit total limits in `packages/contracts/src/practice.ts:260-275,305-309,357-366`. The shared schemas measure UTF-16 units, rather than Unicode code points.
- `transcript-body-budget.test.ts:63-105` sends raw and escaped Unicode through all three actual routes, checks parsed provider payloads and responses, and rejects semantic and HTTP overflow before generation. The fixture measures 199,025 raw bytes and 379,025 escaped bytes. A separate read-only diagnostic padded escaped JSON with legal trailing whitespace to exactly 524,288 and 524,289 bytes. All three actual routes returned 200 then 413, with exactly one provider call each.
- `routes.ts:517-539` rejects a mandatory session returned after the original deadline, then treats caption failure or expiration as optional. The caption signal combines the original signal with a five-second cap. A post-await check discards late caption tokens. The final raw-request check still rejects client cancellation. The implementation relies on provider cancellation cooperation while awaiting, as the receipt explicitly states. The real transcription provider forwards the signal to Gemini and checks it after completion in `transcription.ts:18-36`.
- The wire distinction remains intact. An unconfigured caption provider omits `transcriptionToken`, a failed or expired provider returns null, and success returns the string. `transcription.test.ts:82-127` checks those response objects. `packages/contracts/src/practice.ts:116-125` permits all three shapes.

## Test quality and evidence

Test Behavior, Not Implementation shaped this review. I traced assertions through their catch boundaries and checked whether the complete arrangement detects relevant defects.

The multilingual tests fail when whitespace counting rejects real unspaced text. The punctuation case fails when punctuation counts as words. The byte-budget tests distinguish HTTP rejection from semantic rejection and require the relevant provider call for valid input. Their feedback provider returns insufficient, so the explicit call assertion is essential to distinguish provider assessment from an early route return.

The positive feedback tests compute a stub response and an expectation with `finalizeFeedback`. That does not independently prove scoring correctness, but these tests exercise routing and eligibility, not scoring. The unchanged tests independently assert score 8, endpoint scores 0 and 10, and invalid-highlight rejection at `feedback.test.ts:95-109,224-274`. I found no reason to remove those tests.

The cancellation rows detect the reported response regressions and late-token acceptance. BR-001 limits their proof of abort propagation. They use controlled signals, so they do not establish elapsed-time behavior or a bound for a provider that never settles.

The red log records 16 failures and 39 passes. Its failures match the receipt's descriptions of multilingual rejection, punctuation acceptance, Unicode HTTP rejection, optional-caption deadline failure, and late-caption acceptance. The green log records 55 passes with all three test paths forwarded to Vitest. Formatting changed source line numbers and some test syntax after the red run, so the red log is historical reproduction evidence, not a byte-identical snapshot of the final tests.

I ran the following root command. Its first run replayed cached results. A forced rerun executed all 55 tests successfully across the three files, with zero cached tasks.

```sh
bun run test --filter=@chitchat/backend --force -- src/practice/feedback.test.ts src/practice/transcription.test.ts src/practice/transcript-body-budget.test.ts
```

I also read the successful scoped backend typecheck and formatting logs. I did not rerun the four full-root checks owned by the parent. The forced targeted test command also ran the configured dependency builds, including Prisma generation.

## Added-comment review

Applied `.opencode/skills/poteto-mode/references/agents/comment-sicko.md` only to additions in the scoped diff. The sole added comment is `routes.ts:36-37`. Keep it under the protocol-constraint exception. JSON Unicode escapes can consume six bytes per UTF-16 unit, which explains why the HTTP allowance exceeds the semantic text limit. The budget arithmetic fits below 512 KiB. The semantic limits are enforced by the cited schemas.

No source files touched. Zero comment deletions. Zero MUST KILL flags. Existing comments, including the caption-provisioning comment, were outside this comment review. No new suppressions were present.

## Claims and limitations

The backend repair claims in `.audit/repository-improvement-backend.receipt.md:5-11,23-27` match the inspected files and logs, subject to BR-001's test limitation. The findings document's diagnosis of unrelated provider assertions and its selected backend repairs match the baseline and scoped changes at `.audit/repository-improvement-findings.md:5,9`.

Clarify `.audit/repository-improvement-findings.md:15` if "a deadline separate from primary session provisioning" is intended to mean independent deadlines. Captions retain the original overall deadline and add a separate five-second cap. Only the failure policy becomes independent after the primary session succeeds. The implementation does not grant captions a fresh five seconds after the overall deadline expires.

The backend scope decision in `.audit/repository-improvement.tsv:4` agrees with these artifacts. The visible trail contained no backend acceptance entry when reviewed. The follow-up issue register includes broader lifecycle and integration claims outside these five files. I confirmed the cited transcript contract limits, but this review does not certify those broader audits or the absence of authentication integration coverage.

This is an independent, bounded artifact and code review. It makes no cross-model or full transcript audit claim. No commits, application-source edits, or nested agents were used. The source-preservation comparison, targeted tests, and runtime diagnostics were read-only with respect to the reviewed application files.
