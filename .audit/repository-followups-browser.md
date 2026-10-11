# Browser baseline

Both RI-001 and RI-002 reproduced in real headless Chrome on 2026-10-11. The runner uses Bun's built-in WebSocket and Chrome DevTools Protocol. No application files or dependencies changed.

## Rerun after fixes

```sh
BROWSER_VOICE=1 BROWSER_LABEL="after-fix-$(date +%s)" bun .audit/repository-followups-browser.ts
```

Wait for the onboarding implementation owner to finish before running the command. Run serially in the existing dedicated audit Chrome profile. The runner reads its DevToolsActivePort file under `chitchat-followups-chrome`. Set `CDP_PORT` to override the port and `BROWSER_ORIGIN` to override `https://amber.cc.local`. It opens and closes its own tab and seeds onboarding localStorage with an audit learner.

Exit code 0 means all selected checks pass, 1 means an observed regression, and 2 means an execution blocker. Setup, HTTP target creation, socket connection, CDP commands, and readiness waits report bounded failures. Unexpected runtime, console, network, or fixture errors block a passing result. Expected cancellations must match a held POST's CDP network request ID. Cleanup failures are reported.

Labels beginning with `baseline` and labels with existing evidence are rejected without overwriting those files. The default label includes a timestamp. An invalid label or a collision reports to stdout without writing a replacement JSON. A filesystem write failure reports to stdout and exits 2.

## Hardened closure checks

- RI-001 scopes the motivation textarea and Continue button to the same form. It asserts both disabled while the first POST is held. Synthetic pagehide must cancel that exact network request. After pageshow, both controls must recover. A distinct retry turn must produce a second intercepted POST with the expected body and another disabled pending state.
- RI-002 asserts the transcript toggle remains expanded, controls the visible log, and retains both expected turns with an enabled visible Continue. It checks completion and the pre-reload snapshot. The saved resolvedGoal must exactly equal the fixture outcome, including the benefits and suggested skills. Motivation and conversation have explicit expected values.
- Reload waits for a new top-level document and checks the rendered benefits heading, personalized status, and all three expected benefit cards and their text. The persisted benefits step and exact goal are independent assertions. No provider work may restart on reload.
- The voice fixture accepts string and Request fetch inputs, validates endpoint payloads and call counts, and rejects unmatched onboarding or external-provider fetches and sockets. CDP also intercepts API and Google HTTP traffic throughout the run. Intercepted requests never continue to a live provider. Local application assets and the same-host development WebSocket remain available.

The hardening receipt is `.audit/repository-followups-browser-hardening.md`. Its offline checks do not establish a passing browser regression run.

## Observations

- RI-001. A real POST to `https://api.amber.cc.local/api/practice/onboarding-turns` was intercepted and held pending. After persisted pagehide/pageshow, Chrome reported the fetch canceled with `net::ERR_ABORTED`. The textarea and send button remained disabled. The screenshot still shows the thinking avatar. The lifecycle events are synthetic browser events, not a claim of actual BFCache navigation.
- RI-002. The real onboarding voice UI accepted a completed goal while its transcript was open. The Continue button appeared and the confirmed user/assistant transcript was visible. localStorage still held `step: microphone`, empty motivation, and no resolvedGoal. Reload showed Restart voice and erased the transcript instead of reaching benefits.
- RI-002 fixture boundary. The test injects fake Gemini WebSocket messages and fake onboarding token/completion HTTP responses. A silent MediaStream replaces microphone capture. It exercises the actual React UI and OnboardingLive controller. Web Audio contexts and worklets are part of the method, but the assertions do not independently prove worklet execution or audible playback. This is not live Gemini or hardware-microphone validation.
- Home and `/theme` returned HTTP 200 with Chrome `securityState: secure`, TLS 1.3, and the Portless Local CA certificate. Chrome resolved the origin to 127.0.0.1 without an added DNS mapping or certificate bypass.
- Runtime errors. No JavaScript exception was captured. The first run recorded a favicon.ico 404. Both runs recorded the expected deliberately canceled onboarding fetch. The voice run had no other recorded errors.
- The initial Portless 502 cleared when the web dev server became ready. There is no remaining execution blocker. The user-owned API process was untouched.

## Evidence

- `.audit/repository-followups-browser.baseline.json` and its home, theme, before, pending, and restored PNGs capture the first RI-001 run.
- `.audit/repository-followups-browser.baseline-voice.json` captures both reproductions, request payloads, DOM control states, persisted drafts, TLS details, and runtime errors.
- `.audit/repository-followups-browser.baseline-verified.json` records the final runner verification. It exited 1 with all three intended regression assertions failing, rather than a setup error.
- `.audit/repository-followups-browser.baseline-voice.voice-completed-open.png` shows the completed voice transcript and Continue button.
- `.audit/repository-followups-browser.baseline-voice.voice-reloaded.png` shows the lost goal after reload.
- `.audit/repository-followups-browser.ts` is the repeatable CDP runner. `.audit/repository-followups-browser.voice.js` holds the browser-only provider fixture.

Build the Lever shaped the reusable CDP runner. Prove It Works shaped the actual-browser screenshots and persisted-storage assertions. Application tests, lint, typecheck, and build were not run by this browser-only subagent.
