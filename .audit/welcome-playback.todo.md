# Welcome playback restoration

- [x] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. skip: No browser driver is available. Use an actual component with Audio events as bounded runtime evidence.
- [x] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Existing hook is disconnected and the header hardcodes silence. Timed text personalization disagrees with the recording.
- [x] Plan the fix. If it crosses a function boundary, architect first. Bounded sequential pass requested; no delegation or diverse-model review.
- [x] Verify on the same surface. The actual component regression passes with mocked Audio currentTime/timeupdate. skip: Live-browser verification remains unavailable.
- [x] Stage the commits so the failing repro lands before the fix in git history. skip: Commits were outside the requested scope. Ran the new regression before source changes instead.
- [x] Run Opening a PR. skip: A PR was outside the requested scope.

Data shape remains the existing playback hook with speaking, unavailable, revealedWords, playWelcome, stop and getAnalyser. The active HTMLAudioElement is the identity for callbacks. No new playback state machine or dependency is needed.

Architect choice made before implementation. Parent ownership allows synchronous name-submit playback and centralized navigation cancellation. Self-contained welcome ownership reduces prop threading but requires an imperative bridge or loses user activation on mounting. Select parent ownership with one hook value passed to the header.

Throughput checkpoint. The bounded sequence is component regression, failing run, source wiring and lifecycle correction, passing targeted tests, web typecheck and diff inspection. No parallel source edits because tests and implementation depend on each other.

Fix Root Causes reconnects the dormant hook and removes personalized timing from recorded playback. Model the Domain keeps callback ownership in the active audio identity. Laziness Protocol reuses the hook, shared Button and existing translated labels. Test Behavior Not Implementation measures visible spans through real currentTime/timeupdate events rather than mocking the playback hook.

Final verification. `bun run test --filter=@chitchat/web -- src/components/onboarding` passed 7 files and 117 tests after the final test-mock change. `bun run typecheck --filter=@chitchat/web` passed. Targeted root Turbo lint passed all five changed web files with zero errors and warnings. Recovery tests emitted act-environment and jsdom canvas warnings; typecheck emitted a circular-dependency warning about replaceRouteChunk.

Lead verification later passed 119 component tests and targeted lint. Current web typecheck is blocked by separate concurrent live-transcript edits, including a missing onboarding-transcript module and incomplete final fields in the new voice-caption tests. The earlier passing typecheck above describes the writer's run, not the current checkout. See onboarding-word-sync.todo.md for final evidence and browser limitations.

Fail/pass evidence. Before source changes, the new component regression failed at `expect(audio).toHaveBeenCalledOnce()` with `AssertionError: expected "vi.fn()" to be called once, but got 0 times`. It now passes synchronous Audio construction/play, recorded accessible heading, opacity 0 at 0.29 seconds, first-word opacity 1 at 0.3 seconds, second-word opacity 1 at 1.7 seconds, later words hidden, enabled voice/text alternatives and focus retention after Stop.

Changed web paths are onboarding.tsx, onboarding-introduction.tsx, onboarding.test.tsx, onboarding-introduction.test.ts and onboarding-introduction-playback.test.tsx under apps/web/src/components/onboarding/. No locale, backend or dependency edits were made for this task. Existing unrelated work remains untouched. Source inspection and targeted formatting checks completed; these files were already untracked, so git has no baseline diff for this task.

Backend concern remains out of scope. apps/backend/src/practice/onboarding-live.ts says the learner has not heard a spoken introduction or goal question. The welcome recording already asks what made them want to start practicing, so the fresh live session may repeat a goal question. No live-flow redesign was made.

Unavailable verification. No live-browser driver is available. Real sound, browser autoplay policy, visual timing and screen-reader announcements have not been verified. No commits or PRs were created.
