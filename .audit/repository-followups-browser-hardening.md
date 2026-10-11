# Browser instrumentation hardening receipt

The complete `.audit/repository-followups-browser.review.md` was read. The runner, voice fixture, and browser documentation now address its closure blockers. Existing baseline JSON and screenshots were preserved. No application files or dependencies were changed. No browser regression run was performed against the unfinished onboarding work.

## Changes

- The text check requires the scoped motivation input and its Continue button to be disabled pending. It correlates lifecycle cancellation with the held POST's network request ID. After restoration, it enters a distinct answer through the React input and clicks the same form's Continue button. A second intercepted POST must contain that answer, and the controls must enter pending again.
- The voice check asserts an expanded toggle controlling a visible transcript with both expected messages and an enabled visible Continue. It repeats the check in the pre-reload snapshot. The full saved goal must equal the explicit fixture outcome before and after reload. Motivation and the completed conversation have exact expectations.
- Reload requires a new top-level document. The browser must render the benefits heading, personalized status, expected acknowledgment and pace copy, and three visible cards with their own expected titles, descriptions, and details. The stored benefits step is checked separately.
- Request-based and string-based fetches share strict fixture validation. The fixture checks the learner, completion goal, transcript, endpoint order, and count. Unmatched onboarding or external fetches and external sockets throw and record violations. CDP holds text POSTs and blocks unmatched API and Google HTTP requests. The fixture remains installed through reload, where zero new provider calls are expected.
- Setup and socket connection are inside the reporting boundary with deadlines. Runtime, console, network, and fixture errors affect exit status. Only correlated lifecycle cancellations are expected. Cleanup failures are recorded. Existing evidence paths and baseline labels cannot be overwritten.

## Checks performed

`bun .audit/repository-followups-browser-hardening.check.ts` passed. The generated `.audit/repository-followups-browser-hardening.checks.json` records the results. These checks parse both scripts, exercise Request and string fixture calls, reject unmatched calls and invalid payloads without live traffic, and test actual runner transcript and error-classification helpers with negative cases.

`CDP_PORT=0 BROWSER_LABEL=hardening-setup-failure bun .audit/repository-followups-browser.ts` exited 2 and wrote a JSON blocker report. The receipt was moved to `.audit/repository-followups-browser-hardening.setup-failure.json`.

A local mock CDP HTTP server returned a target whose WebSocket handshake never completed. The runner reported `Error: CDP socket open timeout`, exited 2, and closed the mock target through the HTTP cleanup path. The server was stopped. The report is `.audit/repository-followups-browser-hardening.socket-timeout.json`. This check did not launch or connect to Chrome.

Application typecheck, lint, tests, and build were not run for these audit-only changes. Browser acceptance and independent hardening review remain with the parent. Offline fixture checks do not prove that the onboarding fixes pass.

## Rerun after onboarding work finishes

Use the existing dedicated CDP profile and run serially.

```sh
BROWSER_VOICE=1 BROWSER_LABEL="after-fix-$(date +%s)" bun .audit/repository-followups-browser.ts
```

Model the Domain shaped request-ID ownership and separate assertion, blocker, and cancellation records. Test Behavior, Not Implementation shaped the retry POST, exact persisted outcome, rendered cards, and visible completed transcript checks. Delegation was skipped under the explicit no-nested-agents instruction. The workflow record is `.audit/repository-followups-browser-hardening.todo.md`.
# Runtime correction

The subsequent `closure-verified` run had no unexpected runtime errors and successfully retried text. Three voice assertions exposed incorrect fixture expectations: persisted storage contains a completed turn with its final assistant `reply`, whereas the provider outcome deliberately omits that field. Personalized benefits render that reply rather than fallback text. The coordinator corrected the explicit expected turn and personalized copy using the fixture's own final assistant message. The exact comparison remains strict. The raw report already showed the complete persisted goal and rendered benefits; it was not counted as a successful closure run.

The first final run (`closure`) correctly reported an instrumentation blocker. Its strict interception also blocked the existing React Grab development-version request and Google Fonts stylesheet. The coordinator added GET-only exceptions for the exact React Grab version endpoint and Google Fonts stylesheet/font origins. Unmatched onboarding and provider operations remain blocked. Evidence is retained in `repository-followups-browser.closure.json`; that run is not counted as product failure or successful verification.
