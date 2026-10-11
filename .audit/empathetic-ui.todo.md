# Empathetic UI guidance

- [x] Frame
- [x] Fan out
- [x] Aggregate
- [x] Report

Done means primary-source research is synthesized into concise, actionable guidance in `AGENTS.md`, existing edits are preserved, and the resulting diff is checked.

Coverage uses three read-only research slices. Workers return sources and recommendations without editing files. Models inherit the session because no specific model was requested.

- [x] Research plain language and inclusive content.
- [x] Research recovery, time limits, and accessible feedback.
- [x] Inspect the onboarding example and recommend product-specific rules.
- [x] Add guidance and source links to `AGENTS.md`.
- [x] Inspect the diff and report checks.

Scope stays documentation-only. The example will inform policy, but this task does not change onboarding copy or behavior. Existing working-tree edits stay intact. The agent-facing skill-development guidance is not installed at the expected path; no skill files are being authored.

All three research slices returned. No coverage gaps or worker dropouts. A correctness gap is tracked in `.audit/onboarding-voice-timeout-issue.md`. No cross-model review was requested or claimed.

| Slice | Result | Evidence |
| --- | --- | --- |
| Inclusive language | PASS | Verified GOV.UK and W3C sources support familiar words, predictable controls, and needs-based design. |
| Recovery and timing | ISSUES | W3C supports urgency-appropriate announcements. Actual WCAG conformance remains unassessed. |
| Onboarding context | ISSUES | Static inspection confirms a named recovery action is absent and mode switching resets conversation history. |

Parent verified the primary-source guidance and relevant code snippets. `git diff --check -- AGENTS.md` passed. The diff preserves the existing edits. Typecheck, lint, tests, build, and runtime UI checks were skipped because this change is documentation-only.

Throughput checkpoint. Research runs in parallel. Only the parent edits the shared guidance.
