# Bounded audio cancellation repair

- [ ] 1. Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
  Use deferred browser-audio doubles through the public prepare method as requested.
- [ ] 2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `loop` skill. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
  Bounded hypothesis supplied by parent. Missing pre-resume and pre-acquisition abort guards.
- [ ] 3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
  Add two guards within prepare. skip: nested delegation prohibited.
- [ ] 4. Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
- [ ] 5. Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
  skip: commits prohibited. Save red and green logs instead.
- [ ] 6. Run **Opening a PR**.
  skip: scoped subagent handoff only.

Throughput checkpoint. One sequential red/fix/green cycle; no nested agents. Existing AbortSignal and acquired MediaStream remain the lifecycle model. Pre-edit snapshots isolate this task from the dirty baseline.

Completion. Steps 1 through 4 completed. Steps 5 and 6 skipped for the scope reasons above. Independent review belongs to the parent session.

Red receipt. The requested root test command forwarded to `vitest run src/lib/practice-audio.test.ts`. Three tests failed with `expected "vi.fn()" to not be called at all, but actually been called 1 times` on getUserMedia. Four passed, including post-acquisition cleanup.

Green receipt. The same command passes all seven tests. Web typecheck and lint pass through root Turbo commands. Initial lint failures in the new fixture were corrected; the final lint receipt has zero warnings and zero errors. No build or real-browser microphone permission test ran.

Diff inspected against both pre-edit snapshots. Production change is two throwIfAborted calls. Tests add four cancellation cases with explicitly deferred resume and acquisition promises. Existing baseline content is preserved.

Principles applied. Test Behavior, Not Implementation led to microphone-request absence and all-track cleanup assertions through prepare. Model the Domain kept the existing AbortSignal and stream ownership rather than adding state. Prove It Works required the failing microphone-call evidence and the matching green test run.
