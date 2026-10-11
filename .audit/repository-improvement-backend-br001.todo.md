# BR-001 correction

- [x] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Use the review's exact swallowed-assertion mechanism and a root Turbo mutation test.
- [x] Binary-search the cause. The route catches the assertion thrown inside the provider callback. No broader investigation is needed for this specified correction.
- [x] Plan the fix. Read the actual supplied AbortSignal from the typed mock call after awaiting the request. Assert its aborted state and original reason outside the production catch. Keep the six-case table and rejection/late-token behavior. Skip delegation because this is a bounded subagent task and nested agents are forbidden.
- [x] Verify on the same surface. The test-only in-memory disconnection experiment failed all six cancellation rows at the post-request signal assertion. The targeted green suite passed all 12 tests. Scoped lint and backend typecheck passed. Refreshed the five-file backend scoped diff against the original snapshots and checked the test diff for whitespace errors.
- [x] Stage the commits so the failing repro lands before the fix in git history. Skip because commits are forbidden. Save the exact red and green logs instead.
- [x] Run Opening a PR. Skip because the parent owns integration and review.

Model the Domain preserves the six-case table and typed AbortSignal mock. Test Behavior, Not Implementation requires observing a real failure when caption propagation is disconnected. The mutation experiment is sequential because it must precede the green receipt; lint and typecheck can run independently.
