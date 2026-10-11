# RI-007 authentication integration

- [x] `how` over the affected subsystem. The production index wires Better Auth into Hono and exports fetch without listening.
- [x] `architect` for parallel design exploration. Skip nested exploration because the parent selected fresh databases and a production-import child.
- [x] Write the throughput checkpoint as four todo items.
  - Blocking first steps. Capture the scoped baseline and inspect auth, migrations, and worktree status.
  - Independent workstreams. This delegate exclusively owns auth integration and its shared configuration.
  - Shared mutable state. Each invocation creates a random database. Ownership begins only after CREATE succeeds.
  - Smallest safe decomposition. One owner keeps database and child cleanup ordered.
- [x] Delegate code-writing to a subagent using your configured feature model. This is the delegated implementation. Nested agents are forbidden.
- [x] Verify on the matching surface. Two concurrent real journeys passed. A missing-cookie mutation failed at authentication. Child failure and SIGTERM removed only owned databases. Invalid configuration failed before CREATE. Backend typecheck, lint, and 251 ordinary tests passed.
- [ ] Rebase into small, ordered commits. Skip because commits are forbidden and the baseline is dirty.
- [ ] If the design is contested, `interrogate` before shipping. Skip because the parent selected the design. Independent review belongs to the parent.
- [ ] Run **Opening a PR**. Skip because this task does not authorize a PR.

The named data shape is the disposable database lifecycle. The runner holds no owned database until CREATE succeeds, then waits for each child before DROP. A child-runner function is the only failure-injection seam. The journey reads actual cookies and persisted users, accounts, and sessions.
