# Onboarding word synchronization

- [ ] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
- [x] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `loop` skill. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
- [x] Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
- [ ] Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
- [ ] Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
  skip: No commits requested; retain user changes and verify locally.
- [ ] Run **Opening a PR**.
  skip: No PR requested.

Browser verification is unavailable in this harness. No browser driver skill or browser automation dependency is installed. Use the existing component test runtime to reproduce the missing synchronization and report the live-browser limitation.

Evidence so far:
- The active web origin and English introduction audio both return HTTP 200.
- All 52 recorded clips have word timing data that covers their authored text and stays within clip duration.
- Existing onboarding component and live-library checks pass, 109 tests. Backend timing checks pass, 4 tests.
- The onboarding directory is untracked, so Git has no regression history for this subsystem.
- MCP resource discovery returned no resources or templates. Browser and external history evidence are unavailable.

Throughput checkpoint: Keep the fix local to the existing onboarding audio-to-caption connection. Preserve unrelated user changes. A failing behavioral regression check is the next verifiable unit.

Confirmed source mechanism: OnboardingHeader passes speaking=false and revealedWords=0; the prerecorded welcome playback hook has no production caller. Live voice transcriptions have no word timestamps and are a separate session.

Product decision: The user explicitly chose to restore spoken, timestamped welcome audio on this screen before the voice/text choice. Keep the earlier name/language screens silent. Preserve exact recorded words, accessible stop/replay, and immediate alternatives. Implementation delegated with a failing-test-first requirement.

Recorded asset verification: ffprobe confirms all 26 welcome clip durations match their manifests within 0.1 seconds and all word endings fit the actual audio duration. No asset regeneration is justified.

Independent baseline design exploration recommends parent-owned existing playback, started inside name submission rather than an effect-driven welcome mount. Review contracts include exact transcript, stop/replay with stable keyboard focus, full text on failure and reduced motion, no stale callbacks, and stopping before mode changes or navigation. This is a single-provider exploration, not a diverse-model review or a runtime-browser verdict.

Architecture phases:
- [x] Ground. Traced the hardcoded header, orphaned recorded player, and separate live transcript path.
- [x] Sketch. Compared parent-owned click-started playback with a mounted player.
- [x] Agree. User selected playback on the pre-voice welcome screen. Baseline design review preferred the parent owner.
- [x] Implement. Delegate restores the existing player and behavioral coverage.
- [x] Scrap. skip: No implementation evidence contradicted the bounded design.

Independent accessibility contract review requires a native stop/play button near the beginning of tab order, stable DOM/focus, persistent full text after stop/failure, no deadline or automatic advancement, and no word-level live announcements. This supports an audio-control implementation but is not a WCAG conformance or real screenreader/usability verdict. Automatic speech can still compete with screenreader output; user requested autoplay explicitly.

Outstanding live-browser checks, not claimed as passed:
1. At https://amber.cc.local, enter a name and continue. Confirm the welcome recording plays and each displayed word begins appearing with the spoken recording.
2. Stop with keyboard activation. Confirm all text becomes visible, focus stays on the same control, and playback can be started again.
3. Choose text or voice mid-welcome. Confirm welcome audio stops immediately and does not overlap the destination.
4. Reload a saved welcome screen with autoplay restrictions. Confirm full text and an explicit play control remain available if playback cannot start.
5. Navigate away or suspend the page while audio is loading or playing. Confirm there is no delayed or resumed welcome audio.
6. Check a reduced-motion preference and a screenreader. Confirm persistent accessible full text and no word-by-word live announcements. Assess competing automatic speech without making a conformance claim.

Final local evidence:
- The pre-fix component regression failed with `expected "vi.fn()" to be called once, but got 0 times`. It now passes, with opacity 0 at 0.29s, first word visible at 0.3s, and second word visible at 1.7s.
- Independent source review found no actionable patch regressions and confirmed cancellation, exact transcript, stale callback guards, stable focus control, and full-text restored-screen fallback.
- Lead rerun `bun run test --filter=@chitchat/web -- src/components/onboarding` passed 8 files and 119 tests. This includes a new voice-caption test file from separate concurrent work, not part of this patch. Existing act/canvas warnings remain.
- Lead targeted lint of the five changed files passed with zero errors or warnings.
- Current web typecheck is BLOCKED by separate live-transcript work: missing `./onboarding-transcript` import and missing `final` fields in the newly added onboarding-voice-captions.test.tsx. Earlier combined live-library test run also failed at the missing module. These files were not changed for this fix and were left untouched.
- Browser playback, actual keyboard/SR behavior, and autoplay policy remain unverified. No build, commit, or PR was run.
- The backend fresh-session prompt may repeat the recorded goal question. No backend redesign was made.
