# Onboarding goal streaming implementation

- [x] `how` over the affected subsystem. Sequential source and pinned SDK inspection. No recursive agents per assignment.
- [x] `architect` for parallel design exploration. Compared native SDK UI streams with typed NDJSON snapshots. Sequential exploration because recursive agents are forbidden.
- [x] Write the throughput checkpoint as four todo items.
  - Blocking first steps. Read contracts, provider, routes, hook, tests, pinned SDK, theme and local design skill before changing source.
  - Independent workstreams. One cross-layer feature has one exclusive implementation owner. Parent owns browser verification and independent review.
  - Shared mutable state. Preserve unrelated shared-checkout changes. Request identity isolates stale partial and final callbacks.
  - Smallest safe decomposition. One owner keeps the protocol migration atomic across provider, Hono, API reader and hook.
- [x] Delegate code-writing to a subagent using your configured feature model. This session is the assigned implementation subagent. No recursive agents or commits per assignment.
- [x] Verify on the matching surface. 55 backend tests and 82 web tests passed through Turbo. Backend, web and contracts typechecks and scoped lint passed. Parent owns browser verification and full root checks.
- [ ] Rebase into small, ordered commits. skip: No commits or rebasing authorized in the shared checkout.
- [ ] If the design is contested, `interrogate` before shipping. skip: Parent owns independent review. No recursive agents.
- [ ] Run **Opening a PR**. skip: No PR or shipping requested.

Data shape is a discriminated reply-snapshot, complete-turn or sanitized-error event. Partial replies are display-only replacements. Final validated turns alone update durable history and callbacks. Premature EOF is failure.

Native SDK UI streams would require a new web dependency and message transport state. Typed NDJSON uses the pinned backend SDK partialOutputStream and existing hook without new dependencies.

Test output includes React act-environment warnings and JSDOM canvas warnings. Web typecheck includes a TanStack route-generator circular dependency warning. These checks passed. No browser or real-provider verification performed by this implementation session.
