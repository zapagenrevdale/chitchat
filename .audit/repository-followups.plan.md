# Repository follow-up plan

Complete RI-001 through RI-007 from `.audit/repository-improvement-findings.md`. Each issue needs a reproduced defect or demonstrated coverage gap, a bounded repair, executable verification, and an independent verdict. Disproven findings close with evidence rather than speculative edits.

## Workflow

1. Confirm current code and environment. Compare alternative designs for lifecycle, transcript bounds, and authentication integration before implementation.
2. Build failing regressions for each confirmed defect. Preserve baseline copies so changes remain attributable within the dirty checkout.
3. Implement four separately owned units. Verify each unit before accepting it.
4. Run independent reviews. Fix accepted findings and prove the correction detects the reported defect.
5. Run root typecheck, lint, test, and build. Run the new real-database authentication journey and available runtime smoke checks.
6. Reconcile all seven issue verdicts and record remaining environmental limits explicitly.

## Units and acceptance

| Unit | Issues | Acceptance |
| --- | --- | --- |
| Onboarding recovery and persistence | RI-001, RI-002 | Suspended text and voice work resumes in a usable state. Stale callbacks cannot overwrite new work. A confirmed goal survives reload while its transcript stays open. |
| Guided sessions and worklets | RI-003, RI-004 | Every generated-turn request stays within the actual contract during long sessions. Both worklets register under the expected names. Recorder samples remain ordered and conserved across uneven blocks at 44.1 and 48 kHz. |
| Preview and waveform lifecycle | RI-005, RI-006 | Late audio events cannot affect replacement clips or unmounted consumers. Inactive waveform work settles and all animation handles stop on teardown. |
| Authentication integration | RI-007 | A separately invoked uncached task exercises real Better Auth, Prisma, cookies, signup, signin, authenticated access, signout, and rejection afterward against isolated database resources. Ordinary tests remain database-independent. |

## Ownership and constraints

The current working tree, including the first improvement pass, is the baseline. Preserve existing user work. Source writers receive nonoverlapping file ownership. Shared configuration belongs only to the authentication unit. No commits or PRs are planned while changes overlap the dirty baseline.

The worktree's PostgreSQL container is healthy. The assigned development origins are `https://amber.cc.local` and `https://api.amber.cc.local`. Reuse this identity and Portless configuration. Authentication tests must isolate their own records or database namespace and never clear existing app data.

Use the pinned dependencies and root Turborepo commands. Preserve the existing theme. Do not read, search, or use `THOUGHTS.md`. Do not deploy or force-push.

## Rigor and throughput

This is a multi-part behavior and configuration change, so every unit gets independent review and the combined result gets all four root checks. Tests must fail for the intended defect, not setup errors. Assertions about provider behavior must stay outside production catch boundaries.

Read-only design passes can run together. Implementation groups own different files, with one writer for each group. The authentication environment and UI verification capabilities are the main unknowns. Separate review agents use inherited models. Cross-model review remains unavailable without an explicit model selection request and is not claimed.

The decision trail is `.audit/repository-followups.tsv`. The issue ledger and task checklist are `.audit/repository-followups.todo.md`.

## Accepted designs

Onboarding distinguishes an interrupted attempt from a paused transcript and a confirmed result. Confirmation persists separately from navigation. Text recovery preserves confirmed history and the pending answer. A terminal result interrupted during its reading delay advances once on restoration rather than requesting a fourth turn.

Guided practice keeps a bounded chronological suffix of complete exchanges for generation and the full displayed transcript through existing callbacks. Message IDs use a monotonic counter. Completed and skipped totals remain cumulative. This chooses continued practice over forcing a session end at a transport limit. The partner can lose older conversation context, but the learner's displayed transcript remains intact.

Real-script probes found no recorder or registration defect. RI-004 adds regression coverage without changing working audio processors. Persona preview already guards stale events; RI-005 replaces ineffective assertions. Waveform scheduling keeps its existing effects with explicit ownership of processing, fading, and redraw handles. Idle work settles and wakes on actual changes.

Authentication uses a disposable database per invocation. A child imports the actual production entrypoint and exercises its HTTP handlers in process. This preserves production composition without adding a parallel test-only auth configuration. The runner owns only its newly created database and closes its children before cleanup.
