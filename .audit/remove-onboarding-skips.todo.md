# Remove onboarding skips

- [x] 1. `how` over the affected subsystem.
- [x] 2. `architect` for parallel design exploration.
- [ ] 3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
  - Blocking first steps. Trace all skips and confirm the domain before implementation.
  - Independent workstreams. Read-only grounding is separate from browser setup. Code changes use one owner.
  - Shared mutable state. Only the parent writes repository files. Delegates return proposed patches without editing files.
  - Smallest safe decomposition. One code-writing delegate returns a patch for the coupled onboarding UI and tests.
- [x] 4. Delegate code-writing to a subagent using your configured feature model with a specific scope, named data shape, and success criteria.
  - Adaptation. No file-writing delegate is used. A read-only delegate returns code for the parent to apply without copying or committing human work to another worktree.
- [x] 5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
  - Live Portless browser snapshots confirm no manual skip button in text or voice error screens. Mode switches and voice restart remain.
  - All 81 onboarding tests pass. Web typecheck passes. Existing act/canvas warnings remain in tests.
- [ ] 6. Rebase into small, ordered commits. Stack follow-ups.
  - skip: The user requested a local edit. Do not commit unrelated dirty work or open a PR.
- [ ] 7. If the design is contested, `interrogate` before shipping.
  - skip: No contested design yet.
- [ ] 8. Run **Opening a PR**.
  - skip: No PR requested.

- [x] Keep voice, text, retry, mode switching, back navigation, and edit cancellation.
- [x] Remove skip controls and their unused callbacks from initial choices and both conversation modes.
- [x] Add absence assertions covering chat and voice errors. Pending states inherit the same unconditional deletion.
- [ ] Inspect delegated changes independently and run targeted checks.

The user clarified the target again by pointing directly at the OnboardingGoalStatus button. Scope is manual UI skip controls, not a redesign of backend conversation outcomes or historical saved profiles. The chosen design deletes buttons, callback props, and the dead handler. Parallel candidates identified broader model-returned choose behavior but that is outside the narrowed UI request. The code delegate returned a matching deletion patch. Parent applied the same production deletions immediately after user steering and used a full text journey for the blocked-storage test rather than the delegate's legacy fixture.
