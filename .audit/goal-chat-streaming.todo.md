# Goal chat streaming

- [x] Trace the goal chat provider, route, client, and hook.
- [x] Compare streaming designs and implement the smallest compatible protocol.
- [x] Verify incremental replies, final validation, cancellation, and retry behavior.
- [x] Independently review the completed change.
- [x] Run root typecheck, lint, test, and build. Lint failed on Onboarding complexity, recorded below.

Throughput checkpoint.

- Blocking first steps. Confirm the installed AI SDK supports structured partial output.
- Independent workstreams. One implementation owner and one read-only design reviewer.
- Shared mutable state. Only the implementation owner edits source files. Existing user changes remain intact.
- Smallest safe decomposition. Keep the provider, route, client reader, and hook with one owner because they share one stream contract.

No commit, pull request, or dependency change is requested. Model-diverse architectural review is unavailable without an explicit model request. Browser verification uses the installed agent-browser CLI.

Environment observations.

- The existing checkout contains substantial user work. Implementation stays scoped in this checkout without committing or copying those changes into a new worktree.
- `https://amber.cc.local` responds with HTTP 200.
- `https://api.amber.cc.local` responds with HTTP 404 at its root, which does not establish health of the practice endpoint.
- Playwright and Puppeteer are not installed as workspace dependencies. The user corrected the initial browser-tool assumption. `agent-browser` is installed at `/opt/homebrew/bin/agent-browser` and works through the shell.
- Isolated browser session `goal-chat-streaming` reached the goal text chat via keyboard and text-mode selection. The initial main-region axe scan found zero violations. This is pre-implementation evidence, not proof of streaming behavior.
- A baseline live `idk` submission completed successfully. A DOM observer recorded the full clarification appearing in one update, not provisional replies. This confirms the existing non-streaming browser behavior and that the local goal provider is reachable.
- Prove It Works changes the completion gate to require tests and source review rather than the implementation agent's report alone.
- Model the Domain changes the stream contract to typed partial-reply and validated-final events. A partial reply is not a saved goal.

Architectural review.

- Choose typed NDJSON reply snapshots and final validated turns. Native SDK UI-message conversion exposes structured JSON as text and still needs custom domain data parts.
- Keep the request concurrency lease until stream completion or cancellation, not until the response headers return.
- Wire disconnects to generation cancellation. Sanitize post-header errors and reject truncated streams.
- Announce completed replies rather than tokens. Preserve retry input and remove provisional replies on failure.

Completed verification.

- Live browser requests returned application/x-ndjson with reply and completion chunks. A clear workplace-small-talk answer reached personalized benefits, saved its confirmed result, and focused the destination heading. The sampled live provider emitted one reply snapshot per turn, so these samples do not prove token-by-token rendering.
- A controlled browser stream verified successive reply snapshots, no saved partial output, no partial live-region text, and no premature navigation. EOF without completion removed the partial bubble, preserved the answer, re-enabled the composer, and retained keyboard focus. Retrying with the live backend succeeded.
- Automated tests cover cancellation, stale callbacks, concurrency leasing, final validation, malformed framing, and retries. Browser mocks are distinct from live provider checks.
- Independent review found that dense 240-character Japanese cumulative snapshots exceeded the original 65,536-byte cap. Increased the bounded cap to 262,144 bytes and added Japanese and oversized-stream regression tests. A fresh independent reviewer confirmed the fix.
- Final root typecheck, test, and build passed. Tests reported 257 backend, 473 web, and 8 worktree passes, with some Turbo cache reuse. React act, JSDOM canvas, route-generator, and bundle-size warnings remain.
- Root lint failed on apps/web/src/components/onboarding/onboarding.tsx. Onboarding has complexity 23 against the configured maximum 20. No unrelated refactoring or lint suppression was added to hide this failure.
- Main-region axe scans reported zero violations on baseline chat and completed benefits. No real screen-reader or human usability testing was performed.
- Follow-up correctness gap in existing goal-error copy at apps/web/src/components/onboarding/onboarding-conversation.tsx. It reuses suggestions_error and directs people to choose skills while they are still in chat. Recovery behavior works, but that text does not describe the available retry action. This copy was not changed as part of the streaming transport implementation.
- Closed only the isolated goal-chat-streaming browser session. No commits, pushes, merges, deployments, or dependency changes.
