- [x] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
  Turbo dry JSON records baseline outputs and inputs.
- [x] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `loop` skill. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
  skip: Parent supplied bounded diagnosis. CLI dry runs verify the task configuration directly.
- [x] Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
  skip: This is the delegated implementation. Nested agents prohibited. Task-keyed JSON declarations preserve dependencies and declare package-specific artifacts.
- [x] Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
  Backend dry JSON adds all 30 SVG content hashes and retains default inputs and dependencies. Web tests pass. Database cache restoration passes for all 12 files, but the reported baseline gap is not reproduced because packages/db/turbo.json already overrides build outputs.
- [x] Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
  skip: No commits authorized.
- [x] Run **Opening a PR**.
  skip: Parent owns integration. No PR requested.

Throughput checkpoint. Perform the database cache experiment before other targeted checks. Keep all evidence and backups under the exclusive tooling audit prefix. The parent runs full checks after all writers finish.
