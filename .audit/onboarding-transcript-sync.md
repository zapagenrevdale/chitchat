# Grounding and verification

The onboarding controller appends provider output text immediately. The first playback-start event reveals the full accumulated message. Later text arrivals publish immediately. Audio is independently buffered in the continuous playback worklet. Completion waits for the acknowledgment audio drain.

Browser baseline at https://amber.cc.local used the actual OnboardingLive controller and PracticeAudio worklet with four seconds of generated PCM. At the early observation, the full sentence was visible while audio playback was still active. This reproduces the arrival-versus-playback mismatch without using a provider account or microphone.

The same mismatch was reproduced through the actual onboarding voice screen using a browser-only socket and silent microphone fixture. The full Hello there. response appeared early despite word end offsets of 0.5s and 2s in a three-second PCM turn. The response uses an existing polite live region. The Switch to text and Show transcript controls stayed visible.

Scope is onboarding assistant transcript presentation and the shared playback primitive. Practice presentation remains unchanged. Existing user changes are copied into a detached implementation worktree without committing them. THOUGHTS.md is excluded from source snapshots and all investigations.

Rubric for design selection is playback-driven timing, missing-offset safety, interruption and turn isolation, small compatible API, and behavioral tests. Candidate models are defaults because no explicit role-model selection was requested. Distinct-model diversity is unavailable under the harness policy. No shipping gate is being opened.

Candidate A reports consumed PCM progress and keeps disclosure policy in the onboarding turn. Candidate B inserts transcript cue markers into the worklet. Independent judging selected A for its smaller shared audio API and testable turn-local policy, scoring A 5/5/4/5/5 and B 5/5/5/3/4 on the rubric. Graft explicit generation and turn-origin isolation from B. Reject wall-clock pacing and invented word alignment. Untimed text releases only at successful spoken drain.

Pinned SDK 2.22.0 supports outputAudioTranscription.wordTimestamp and Transcription.words with duration-string word offsets. Raw WebSocket top-level offsets also exist in current API docs. Actual constrained 3.8 Live output timestamps and their origin are not yet captured. Tests and browser fixtures can prove playback gating, not live-provider alignment.

A live constrained 3.8 Live capture requested wordTimestamp and produced two audio turns, but every transcript segment omitted words and top-level offsets. The first probe failed on binary WebSocket decoding, then the corrected probe successfully captured both turns. No credentials were logged. The user explicitly selected approximate live pacing over showing untimed text after speech. Add an approximate playback-driven fallback before integration. Exact timestamps remain authoritative when available. The implementation must not describe estimates as exact synchronization.

| Before | After | Why |
| --- | --- | --- |
| All received text appears at speech start. | Prefix disclosure follows rendered audio progress. | Keep reading closer to the conversation instead of exposing the whole response immediately. |
| Provider generation finality confirms the whole message. | Spoken drain finalizes the message. | Interrupted or buffered text must not count as heard. |
| No output timestamp fallback. | User-approved approximate word pacing. | The live model omits timings; avoid an end-only transcript that the user explicitly rejected. |

No decorative easing, fades, transforms, or new UI controls are needed. Preserve existing theme and polite live regions. Browser checks will cover visible progression, transcript keyboard recovery, and focus stability. This is not human usability or screen reader testing.

Independent audio review found a residual-progress defect in the new worklet reporting. A short finished turn or underrun below the periodic reporting threshold leaves getPlaybackPosition stale until explicit drain. Accepted fix is to flush any unreported consumed PCM before playing:false at queue exhaustion. Synthetic fade samples remain excluded. Add behavior coverage after the current implementation owner releases its worktree.

The residual-progress fix and its behavior tests passed in the full worktree checks. Typecheck, lint, all tests (407 web, 252 backend, 8 worktree), and build passed. The final review accepted the core design but found a tool-ended turn skipped duration adaptation, and highlighted repeated caption/log announcements as an assistive-technology risk. Separate owners are fixing those disjoint paths. The caption/log remedy preserves accessible text and existing status/error announcements while disabling redundant incremental voice announcements. Real screen reader testing remains unperformed.

Workflow limitation. The implementation owners used the isolated worktree sequentially. Final integration and the accessibility follow-up have disjoint file ownership in the main checkout rather than separate worktrees. This is weaker than the feature playbook's worktree-per-writer rule; do not claim full workflow isolation. No shipping or merge gate is opened. The detached scratch checkout has no configured development resources; teardown completed without removing source while the final fix owner is active.

The accessibility follow-up returned two passing component tests. Parent review added required final fields to its message fixtures before the full main checks, and removed a duplicate rationale comment. Caption text remains available to assistive technology, voice transcript stays keyboard scrollable, and phase status remains polite. The original main onboarding-conversation file was untracked user work, so review compared it with the isolated source snapshot rather than relying on git diff against HEAD.

A fresh independent reviewer passed all three accepted follow-ups. Tool-boundary generation/duration adaptation, residual worklet progress flush, and non-duplicating accessible voice captions. Tool-boundary regressions failed before the fix and then passed (61 targeted tests). Main integration of the original foundation is still pending completion before the small tool-boundary follow-up can be applied there.

Final outcome. Integration preserved all eight baseline originals, verified by reversing the supplied patch. The tool-boundary follow-up was then applied to main. All ten named implementation files match the final isolated worktree source byte for byte. Main full typecheck, lint, tests, and build passed. Tests included 447 web tests; backend and worktree tasks replayed successful cache results, while the integration owner separately forced the backend onboarding tests in main. Build retained its large-chunk warning; jsdom tests retained canvas and act warnings.

Final browser evidence on https://amber.cc.local. Real OnboardingLive and PracticeAudio rendered synthetic PCM with no provider or microphone input. Timed text stayed absent early, showed Hello at the intermediate observation, then finalized Hello there. only after drain. Untimed text similarly showed an intermediate Untimed prefix. Streaming text progressed from What to What would, stayed unchanged during underrun, resumed to What would you like, and stayed unchanged after interruption. All fixture error lists were empty.

The actual voice UI showed no reply early, Hello partway through a three-second untimed turn, and Hello there. at drain. Caption/draft live regions were off, while voice phase status remained polite. Enter opened the transcript with focus retained on Back to voice; the readable log had aria-live off and tabIndex 0. Space closed it and retained focus on Show transcript. No real screen reader or human usability test was performed. An initial direct browser probe timed out on suspended audio without a user gesture; a later probe was invalidated by development reloads during build checks. The final verified runs happened after checks finished and trusted keyboard/click gestures resumed audio.
