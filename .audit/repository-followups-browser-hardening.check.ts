import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";

const checks = [];
const source = await Bun.file(".audit/repository-followups-browser.voice.js").text();
for (const file of [".audit/repository-followups-browser.ts", ".audit/repository-followups-browser.voice.js"]) {
  new Bun.Transpiler({ loader: file.endsWith(".ts") ? "ts" : "js" }).transformSync(await Bun.file(file).text());
  checks.push(`Parsed ${file}`);
}
function fixture() {
  const live = [];
  const context = createContext({ URL, Request, Response, EventTarget, Event, MessageEvent, setTimeout, navigator: { mediaDevices: {} }, location: new URL("https://amber.cc.local/"), fetch: (...args) => { live.push(args); return Promise.resolve(Response.json({})); }, WebSocket: class { constructor(...args) { live.push(args); } } });
  runInContext("window = globalThis", context);
  runInContext(source, context);
  return { context, live };
}
const base = "https://api.amber.cc.local/api/practice/";
const learner = { name: "Browser Audit", language: "English" };
const { context, live } = fixture();
const session = await context.fetch(new Request(`${base}onboarding-sessions`, { method: "POST", body: JSON.stringify(learner) }));
assert.equal((await session.json()).token, "auth_tokens/browser-audit-fake");
const { outcome, messages } = context.browserAuditVoice;
const result = await context.fetch(`${base}onboarding-completions`, { method: "POST", body: JSON.stringify({ ...learner, outcome: { status: outcome.status, goal: outcome.goal, suggestedSkills: [] }, messages: [messages[0]] }) });
assert.deepEqual(await result.json(), JSON.parse(JSON.stringify(outcome)));
assert.equal(context.browserAuditVoice.calls.length, 2);
assert.equal(live.length, 0);
checks.push("Request-based token and string-based completion use validated fixtures with zero live fetches");
for (const [url, options] of [
  [`${base}onboarding-recommendations`, { method: "POST" }],
  [`${base}onboarding-sessions?unexpected=1`, { method: "POST" }],
  [`${base}onboarding-completions`, { method: "GET" }],
  ["https://generativelanguage.googleapis.com/v1/models", {}],
  ["https://other-provider.invalid/session", {}],
]) {
  await assert.rejects(context.fetch(new Request(url, options)), /Browser audit fixture/);
}
await assert.rejects(context.fetch(`${base}onboarding-sessions`, { method: "POST", body: JSON.stringify(learner) }), /Duplicate/);
const invalid = fixture();
await assert.rejects(invalid.context.fetch(`${base}onboarding-completions`, { method: "POST", body: JSON.stringify({ ...learner, outcome, messages: [] }) }), /Completion before session/);
await invalid.context.fetch(`${base}onboarding-sessions`, { method: "POST", body: JSON.stringify(learner) });
await assert.rejects(invalid.context.fetch(`${base}onboarding-completions`, { method: "POST", body: JSON.stringify({ ...learner, outcome: { ...outcome, goal: "Wrong truthy goal" }, messages: [messages[0]] }) }), /Unexpected completion outcome/);
assert.throws(() => new context.WebSocket("wss://other-provider.invalid/live"), /Unmatched WebSocket/);
assert.throws(() => new context.WebSocket("wss://generativelanguage.googleapis.com/unknown"), /Unexpected Gemini/);
assert.equal(live.length, 0);
assert.equal(invalid.live.length, 0);
checks.push("Unmatched Request fetches, providers, duplicate requests, invalid payloads and sockets fail closed");
const baseline = await Bun.file(".audit/repository-followups-browser.baseline-verified.json").json();
assert.equal(JSON.parse(baseline["voice-completed-open"].draft).resolvedGoal, undefined);
assert.equal(JSON.parse(baseline["voice-reloaded"].draft).step, "microphone");
checks.push("Preserved baseline still contains the original missing-goal and microphone-reload failures");
const runner = await Bun.file(".audit/repository-followups-browser.ts").text();
const helpers = runner.slice(runner.indexOf("const input ="), runner.indexOf("try {\n  if (!/"));
const state = createContext({ errors: [], requests: [{ networkId: "owned" }], report: { failures: [] } });
runInContext(helpers, state);
state.errors.push({ kind: "network", lifecycleStarted: true, detail: { canceled: true, errorText: "net::ERR_ABORTED", requestId: "owned" } });
state.errors.push({ kind: "network", lifecycleStarted: true, detail: { canceled: true, errorText: "net::ERR_ABORTED", requestId: "unrelated" } });
state.errors.push({ kind: "runtime", detail: "unexpected" });
state.classifyErrors();
assert.equal(state.report.expectedCancellations.length, 1);
assert.equal(state.report.unexpectedErrors.length, 2);
const completed = { open: true, controlled: true, visible: true, continueReady: true, text: messages.map(message => message.text).join("\n") };
assert.equal(state.assertTranscript(completed, "offline", { messages }), true);
for (const mutation of [{ open: false }, { controlled: false }, { visible: false }, { continueReady: false }, { text: messages[0].text }]) {
  assert.equal(state.assertTranscript({ ...completed, ...mutation }, "offline mutation", { messages }), false);
}
checks.push("Actual runner helpers reject closed, hidden, incomplete transcripts and distinguish unrelated abort/runtime errors");
const receipt = { capturedAt: new Date().toISOString(), mode: "offline instrumentation checks only", checks, browserRun: false };
await Bun.write(".audit/repository-followups-browser-hardening.checks.json", JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
