# Practice tracing

Prompts are defined in the backend source. Langfuse is used only for tracing.

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` in `apps/backend/.env`, then restart the backend with the normal Portless development command. The base URL must match your Langfuse project region or self-hosted instance. Both keys are required to enable tracing. With either missing, practice continues without telemetry. Credentials never go to the web app.

Each voice conversation gets a Langfuse session ID. A `practice.live` lifecycle trace contains the exact system prompt, its SHA-256 hash, model, voice, and available tools. `provision-live-session` records ephemeral-token creation, excluding the token itself.

Separate `practice.turn` traces in the same session contain readable user input and assistant output. `generate-live-response` generation observations carry the model, system prompt, current user transcript, and response. Gemini retains the prior audio context internally; these inputs are diagnostic transcripts, not a complete replay of the model's audio context. Transcript snapshots update the same turn by message ID. A turn is finalized when the next one starts or the conversation closes.

Tool observations attach to the current turn and record function name, ID, arguments, and whether the app accepted it. Lifecycle observations on the conversation trace record connections, interruptions, playback, errors, ending, and closure. The lifecycle root output records the closing reason.

After captions drain, `live.review_requested` records `transcript` as its source. The backend creates an `assess-practice-transcript` generation linked to the same session, with the complete transcript, scene, fixed rubric, rubric version, model, returned token usage, and validated feedback including the server-calculated score. Invalid model output is retained for diagnosis, but never returned as feedback. These are generation outputs, not Langfuse evaluation Score objects.

The independent `speak-practice-feedback` generation records the exact recap text, personality delivery prompt, selected voice, and audio size. Recap text is assembled from confirmed feedback; TTS does not re-evaluate the conversation. Written feedback is returned before speech is requested. Speech failures preserve the written result. `live.tool_cancelled` still records IDs cancelled during the live conversation.

Backend setup and place-image requests also create generation observations. Generation observations include input/output token usage when supplied by Gemini. Image requests record their text prompt and whether a reference image was supplied, excluding image bytes. No raw microphone audio, generated audio, auth cookies, Gemini tokens, or provider error URLs are recorded. Transcripts and scene prompts are recorded, so they may contain details spoken by the user.

The browser sends bounded event batches to Hono using an opaque capability issued with that session. The endpoint checks the web origin, capability, payload size, and per-session event budget. It has a separate budget from provisioning so voice telemetry cannot exhaust the 30-request setup limit. This matches the app's anonymous practice flow; it does not associate traces with account identities.

Delivery is best effort and never blocks audio. The queue flushes every two seconds and on normal close, serializes requests, uses keepalive, and drops failed batches. Browser timestamps and sequence numbers are retained as metadata; live span timestamps represent backend receipt, not model inference latency. Live audio token counts and costs are not inferred from transcript text. The lifecycle output reports `missingEvents` from received sequence numbers so dropped batches can be distinguished from a missing model action. Tabs killed before delivery and backend restarts can lose pending events. Sessions without a closing event finish as `telemetry_expired` one minute after the 15-minute session expiry. SIGINT/SIGTERM closes pending traces and flushes the SDK exporter.

To diagnose a missed goodbye, open the conversation in Langfuse Sessions and compare the farewell turn with its `end_conversation` tool observation. No tool observation means the browser did not report receiving the call (check sequence gaps and incomplete closure before concluding Gemini omitted it). `accepted: false` indicates client rejection. An accepted call should be followed by `live.ending`, playback completion, and `live.closed` with the model's reason.

The backend holds a bounded, process-local registry (500 traced sessions, 2,000 events per session, 240 events per minute). At capacity, new calls still work but are untraced. Multi-instance deployments would need session affinity or a shared registry before reliable cross-request live tracing can be expected.

## Integration references

- [Langfuse Gemini integration](https://langfuse.com/integrations/model-providers/google-gemini): the published automatic instrumentor is Python-based.
- [TypeScript manual instrumentation](https://langfuse.com/docs/observability/sdk/instrumentation): manual lifecycle observations for asynchronous events.
- [Trace best practices](https://langfuse.com/docs/observability/best-practices): per-turn traces, session grouping, generation/tool types, and meaningful inputs/outputs.
- [Supported ingestion](https://langfuse.com/docs/api-and-data-platform/features/public-api): the scoped SDK uses OpenTelemetry, avoiding the deprecated legacy trace ingestion API.
