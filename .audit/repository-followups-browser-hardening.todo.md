# Instrumentation hardening

Data shape is a run report with assertion failures, execution blockers, request IDs, expected cancellations, unexpected errors, DOM snapshots, and exact persisted outcomes. The fixture owns expected messages and validated endpoint calls.

Throughput checkpoint. One owner edits the runner, fixture, and documentation. The read-only review supplies the defects. Offline checks can run now. The parent owns the serial browser rerun after onboarding changes finish.

1. Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
   - Skip browser reproduction under the explicit hold on unfinished onboarding. Read the complete review and retained baseline evidence.
2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `loop` skill. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
   - Complete. Review identifies weak closure assertions, unbounded setup, and permissive fixtures. Traced the runner, voice fixture, form, benefits copy, and request payloads directly. No application changes.
3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
   - Complete locally. Delegation and multi-model exploration skipped under the no-nested-agents instruction. Compared incremental booleans with report-owned assertions and request-ID correlation. Chose the latter because it retains failure evidence and gives cancellation an explicit owner.
4. Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
   - Offline verification only. Browser acceptance remains pending with the parent.
5. Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
   - Skip staging and commits in this shared checkout. Preserve the existing failing baseline.
6. Run **Opening a PR**.
   - Skip. Parent owns integration. Independent hardening review remains pending.
