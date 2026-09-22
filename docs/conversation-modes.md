# Conversation modes

Practice offers **Free talk** and **Guided**, independently of challenge level. The `/practice-design` setup exposes the choice. The retired `/practice` URL permanently redirects there. The browser remembers it locally; it stays fixed during a conversation. An omitted mode means Free talk for compatibility.

## Free talk

The existing Gemini 3.1 Flash Live Preview audio conversation remains in place. After a partner turn, **Suggest a reply** asks Hono for one optional prepared answer. The text appears centered above the waveform, with refresh and dismiss controls. It is never submitted automatically and does not enter the transcript unless the learner speaks.

Generation is cancelled when a new turn makes it stale. A displayed suggestion remains while the learner speaks, then clears when the partner responds. Feedback receives `suggestionShown` on the following user turn: this indicates help was displayed, not that it was used. The feedback instruction avoids crediting those turns as independently composed language.

The Free talk module owns suggestion requests, cancellation, and assistance attribution alongside its transcript. The React hook displays suggestion state and forwards controls. Playback, reconnect, review, dismissal, and closure cancel pending help; late responses cannot display or mark a learner turn. Tests exercise displayed help through the real Free talk module into the recap input.

## Guided

The browser owns one microphone and the explicit turn lifecycle:

1. Hono generates the selected partner's text plus a short prepared learner reply.
2. Hono synthesizes the partner text using the selected persona voice.
3. After playback drains, Hono issues a constrained transcription token and the browser streams microphone audio directly to Gemini's transcription service.
4. Interim word matches render as provisional. Only finalized segments advance confirmed progress.
5. After all words match and at least 650 ms of locally observed quiet, the controller locks the turn, adds one learner message, and requests the next partner turn.

The learner speaks normally; all letters within a matched word change together. This shows phrase-following progress, not pronunciation accuracy. Matching ignores punctuation/case and expands a small explicit contraction map. Missing or substituted words stop progress. Fillers and repetitions are tolerated; the learner can repair a missing suffix in a later finalized segment. **Try again** resets the attempt. **Skip turn** records a skip and requests a new prompt without fabricating a user message.

Generation and recognition errors offer retry/skip. Generated partner text survives a TTS failure so retry does not regenerate or duplicate the turn. Microphone failures end the session and release resources so the learner can start fresh. Session cancellation and generation IDs reject late callbacks. Client requests and backend generation have bounded deadlines.

Guided recap counts completed/skipped phrases. The independent curiosity/listening/sharing score is not used for app-written answers. There is no pronunciation score.

## Implementation

- `packages/contracts/src/practice.ts`: mode and request/response contracts.
- `apps/backend/src/practice/conversation-modes.ts`: suggestions using `gemini-3.1-flash-lite` and Guided text using `gemini-3.6-flash`.
- `apps/backend/src/practice/conversation-routes.ts`: conversation request validation, shared cancellation/deadline handling, and safe quota errors; mounted after the shared Practice origin and request-budget checks.
- `apps/backend/src/practice/speech.ts`: shared persona TTS, extracted from the existing recap implementation, using `gemini-3.1-flash-tts-preview`.
- `apps/backend/src/practice/transcription.ts`: existing constrained `gemini-3.5-transcribe-live` provisioning.
- `apps/web/src/lib/practice-guided.ts`: Guided lifecycle and completion gate.
- `apps/web/src/lib/phrase-progress.ts`: explicit word normalization and matching.
- `apps/web/src/components/practice/speaking-prompt.tsx`: centered speaking prompt and optional help.

Hono owns provider credentials, validation, generation, and request budgets. Suggestions, Guided text, and Guided speech use `GEMINI_API_KEY` first and retry once with a distinct `GEMINI_API_KEY_LIVE` after HTTP 429, 500, 502, 503, or 504. Cancellation, invalid requests, authentication failures, and malformed output do not trigger fallback. Both attempts share the request deadline. Exhausted provider quotas remain HTTP 429 and show a readable usage-limit message in the UI. Web never imports the database. No dependency was added and no generic provider framework was introduced.

## Verification and current limits

The automated suite covers matching, interim revisions, missing words, repairs, mute, stale callbacks, duplicate completion, skip, speech retries, microphone failure, suggestion cancellation, and backend input/output validation. Standard root checks and the amber worktree smoke checks pass.

A real-provider smoke round trip generated partner text in approximately 1.8 s and had partner audio ready at approximately 7.1 s. Streaming synthesized speech produced 10 interim events and a final match of all 14 expected words. Chrome testing used a synthetic microphone through the actual browser audio worklet and Gemini transcription connection, verified automatic submission and the next partner turn, then retry, skip, and recap. Desktop and 390×844 layouts were checked. Free talk generation, refresh, and dismissal were also verified in Chrome without adding a user transcript message. No room audio was captured; the temporary microphone override was removed after testing.

Generated suggestions can still introduce unsupported roleplay details despite the grounding instruction; they are practice prompts, not reliable statements of learner facts. A later failure investigation reproduced Gemini 3.6 Flash free-tier quota exhaustion. The secondary-key fallback now covers Guided text and speech, with regression tests for recovery, exhausted fallback, and cancellation. A real-provider round trip with fallback enabled produced partner audio, matched all 16 prepared words through transcription, and generated the next turn. Those measured timings are observations, not service guarantees. Human accents, background noise, and microphone-specific silence thresholds still need real-user testing. There is no mid-session engine switching or phoneme-level assessment.

Provider references checked during implementation: [Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe), [Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation). UI component discovery used the [ReUI registry catalog](https://reui.io/llms.txt), with the existing button primitives and ElevenLabs waveform reused.
