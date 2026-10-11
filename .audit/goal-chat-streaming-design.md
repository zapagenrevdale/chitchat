# Goal chat streaming design

The browser receives provisional reply snapshots, then one validated final turn. The provider remains responsible for interpretation, clarification limits, and benefit selection. Hono owns transport and concurrency. The client owns framing validation. The hook owns provisional display, accepted history, retry, and navigation.

Candidate 1 uses AI SDK UI-message streams. Its standard framing is useful, but structured generation emits JSON rather than only the reply. It requires custom domain data parts and a new browser dependency or parser. It does not replace the final onboarding contract.

Candidate 2 uses typed newline-delimited JSON. Each reply event replaces the current provisional text. A complete event carries the validated onboarding turn after benefits finish. An error event ends the attempt without committing partial output. It reuses the existing browser hook and contracts package without new dependencies.

Choose candidate 2 based on the independent protocol exploration. The implementation agent owns the precise signatures and schema. Streamed status, goal, and skills are never accepted before final validation.

Preserve the concurrency lease for the whole producer lifetime. Request cancellation, reader cancellation, and timeouts stop generation and benefit selection. Post-header failures become sanitized domain events. An incomplete stream is a failure, not a completed reply.

Keep partial tokens outside live regions. Completion, errors, and destination focus remain understandable without token-by-token announcements. Retry preserves the learner's input and confirmed conversation, discarding provisional replies.

Verification includes provider mock streams, route event ordering and concurrency, fragmented network parsing, hook persistence and recovery, full workspace checks, and browser-visible incremental updates. A deterministic browser mock proves client rendering only. A live provider smoke check is required to prove provider-to-proxy delivery.

The implementation and independent protocol reviewer are separate agents. No model-diversity claim is made. No commit or pull request is part of this task.
