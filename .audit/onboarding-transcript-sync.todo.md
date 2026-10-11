# Onboarding transcript synchronization

- [x] 1. `how` over the affected subsystem.
- [x] 2. `architect` for parallel design exploration.
- [x] 3. Write the throughput checkpoint as four todo items.
  - Blocking first steps. Inspect existing playback lifecycle and pinned SDK timestamp support before implementing.
  - Independent workstreams. Read-only design candidates run independently. One owner implements the coupled audio and transcript path.
  - Shared mutable state. Implementation uses an isolated snapshot worktree. Main checkout user edits remain untouched.
  - Smallest safe decomposition. One owner keeps worklet progress, audio adapter, and turn transcript state consistent.
- [x] 4. Delegate code-writing to a subagent using your configured feature model with a specific scope.
  - First owner implements playback progress and timed transcript foundation in an isolated worktree.
  - User selected approximate live pacing after a real provider capture showed missing timestamps. A fresh owner implemented that fallback.
- [x] 5. Verify on the matching surface.
  - Fixed the independent audio review's residual-progress finding. Added short-audio and underrun behavior tests. Integration, final review, full checks, and browser verification are in progress.
  - Full worktree typecheck, lint, test, and build passed. Final review found tool-ended output needs duration adaptation. Incremental captions also need to avoid live announcements competing with voice.
  - Both follow-ups passed fresh independent review. Main integration matches the final worktree source exactly. Full main typecheck, lint, test, and build passed. Actual browser/worklet fixtures verified timed and approximate prefixes, underflow freeze, interruption cancellation, and keyboard transcript recovery. Real perceived audio alignment and real screen reader testing remain unverified.
- [ ] 6. Rebase into small, ordered commits. Stack follow-ups.
  - skip: User requested implementation, not commits or rebasing their existing work.
- [ ] 7. If the design is contested, `interrogate` before shipping.
  - skip: No shipping requested. Revisit if design remains contested.
- [ ] 8. Run Opening a PR.
  - skip: No PR requested.

Architect phases. Ground, Sketch, Agree, Implement, Scrap.
Arena phases. Frame, Fan out, Cross-judge, Pick, Graft, Verify.
Rubric. Playback-driven timing, missing-offset safety, interruption and turn isolation, small compatible API, behavioral tests.
Design diversity. Model overrides require explicit user model selection, so candidates use the default model. No distinct-model verdict or shipping claim.
