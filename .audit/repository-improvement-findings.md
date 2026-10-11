# Repository assessment

The current architecture has useful boundaries. Hono owns provider calls and validation. Web API and storage readers validate external values. The audits found meaningful tests for PCM samples, stale voice callbacks, Unicode onboarding requests, and concurrent worktree ownership. A broad test deletion would remove useful protection.

The strongest weakness is coverage across lifecycle and package boundaries. Some rejection tests observe an unrelated provider operation. Audio doubles omit startup cancellation. Backend test cache inputs omit the web-owned avatar files those tests read.

## First improvement pass

1. Repair multilingual feedback eligibility, transcript byte budgets, and optional caption cancellation in the backend. Strengthen the existing endpoint tests to observe assessment calls and actual responses.
2. Prevent canceled audio startup from requesting microphone access after a pending audio-context resume. Test cancellation before startup and across both awaits.
3. Correct cross-package asset inputs. Make missing web test discovery fail. Verify cache restoration against generated files.

The initial audit incorrectly reported missing Prisma cache outputs because it missed `packages/db/turbo.json`. The experiment restored all 12 generated files byte-for-byte under that existing configuration. The redundant root output change was removed. The receipt is `.audit/repository-improvement-tooling.receipt.md`.

The first pass keeps existing public data shapes. Feedback takes typed transcript messages. Audio startup uses its existing AbortSignal and owns any acquired MediaStream. Captions retain the original overall deadline and an additional five-second cap. Only their failure policy becomes independent after primary provisioning succeeds.

## Open issue register

These findings came from static audits unless otherwise stated. The subsequent pass resolved RI-001 through RI-007. See `.audit/repository-followups.findings.md` for independent verdicts, browser and database evidence, and the newly tracked RI-008 free-mode transcript-budget issue. The table below preserves the original findings and verification targets.

| ID | Finding | Evidence | Next verification |
| --- | --- | --- | --- |
| RI-001 | Onboarding text and voice can retain a busy state after page suspension. | `apps/web/src/components/onboarding/use-onboarding-goal.ts:44-50`, `use-onboarding-live.ts:101` | Dispatch persisted pagehide and pageshow during active work. Check retry usability and stale-result isolation. |
| RI-002 | A confirmed voice goal is not persisted while its transcript remains open. | `apps/web/src/components/onboarding/onboarding-conversation.tsx:229-239`, `onboarding.tsx:225-236` | Complete while viewing the transcript, remount from actual saved storage, and inspect the confirmed goal. |
| RI-003 | Long guided sessions eventually exceed the shared transcript contract. | `apps/web/src/lib/practice-guided.ts:134-170`, `packages/contracts/src/practice.ts:260-275` | Exercise the boundary and require a usable terminal state or explicitly bounded outgoing history. |
| RI-004 | Worklet tests do not cover recorder sample conservation or registered processor names. | `apps/web/public/audio/recorder.worklet.js:7-26`, `apps/web/src/lib/playback-worklet.test.ts:29-30` | Execute recorder blocks at both supported native sample rates and verify names and samples. |
| RI-005 | Persona preview tests check an onended property although production uses event listeners. | `apps/web/src/components/practice/use-persona-preview.test.ts:102` | Dispatch late ended and error events after stop and replacement. |
| RI-006 | Waveform tests bypass animation through a null canvas context. Idle frame scheduling deserves investigation. | `apps/web/src/components/practice/live-waveform.test.tsx:12`, `apps/web/src/components/ui/live-waveform.tsx:209-231,423-426` | Use a real canvas-shaped stub and controlled animation frames to inspect settling and teardown. |
| RI-007 | No audited integration journey exercises Better Auth, Prisma, and session cookies together. | `apps/backend/src/app.test.ts:30-44`, `apps/backend/src/auth.ts:7-14` | Add an isolated-database signup, signin, authenticated request, and signout journey. |

## Baseline evidence

All four root commands passed before edits. Logs are `.audit/repository-improvement.baseline-{test,typecheck,lint,build}.log`. Some tasks reused Turbo caches. The test log reports 224 backend, 327 web, and 8 worktree tests.

Separate agents performed the audits and reviews. This run does not claim cross-model diversity. The trail reviewer inspected the provided artifacts and visible files, without a full transcript export.

## Implemented and verified

The backend uses Unicode word segmentation for feedback eligibility. All three transcript endpoints accept the tested 60,000-character raw and escaped Unicode requests under a finite 512 KiB transport ceiling. Optional caption timeout preserves the created practice session, while request cancellation still rejects it.

Audio startup checks cancellation before resuming audio and before requesting microphone access. Deferred tests also verify cleanup when microphone permission arrives after cancellation.

Backend test cache inputs include web-owned persona assets. Web test discovery fails when no tests are found. The existing Prisma output configuration remains unchanged.

All four final root commands passed. Logs are `.audit/repository-improvement.final-{test,typecheck,lint,build}.log`. The test log reports 251 backend, 331 web, and 8 worktree tests. Scoped diffs and pre-edit snapshots preserve attribution against the dirty baseline. No commit or PR was created.

Independent review then found a swallowed assertion in the new caption tests. The assertion now runs outside the provider callback. A deliberate disconnected-signal mutation fails all six cancellation cases. After removing that mutation, all 12 transcription tests, backend typecheck, and scoped lint passed. This final test-only correction did not trigger another full build or suite run.

These checks use local providers and browser API doubles. They do not establish live Gemini behavior, a real microphone permission journey, or a database-backed authentication journey.
