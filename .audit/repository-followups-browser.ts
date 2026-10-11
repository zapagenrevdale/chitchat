import { isDeepStrictEqual } from "node:util";

const origin = process.env.BROWSER_ORIGIN ?? "https://amber.cc.local";
const label = process.env.BROWSER_LABEL ?? `run-${Date.now()}`;
const prefix = `.audit/repository-followups-browser.${label}`;
const errors = [];
const requests = [];
const pending = new Map();
const report = { origin, label, capturedAt: new Date().toISOString(), errors, requests, network: [], failures: [], diagnostics: [], expectedCancellations: [], unexpectedErrors: [] };
let ws;
let target;
let port;
let sequence = 0;
let textPhase = false;
let lifecycleStarted = false;
let closing = false;
let canWrite = false;
let documentGeneration = 0;
const input = `document.querySelector('main textarea[aria-label="What brings you here?"]')`;
const form = `${input}?.closest('form')`;
const submit = `${form}?.querySelector('button[type="submit"][aria-label="Continue"]')`;
const controlsReady = `Boolean(${input} && !${input}.disabled && ${submit} && !${submit}.disabled)`;
const transcript = `(() => {
  const section = document.querySelector('[data-voice-session]');
  const toggle = section?.querySelector('button[aria-expanded]');
  const log = section?.querySelector('[role="log"]');
  const visible = e => Boolean(e?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && e.getBoundingClientRect().height > 0);
  const button = [...(section?.querySelectorAll('button') ?? [])].find(e => e.innerText === 'Continue');
  return {open: toggle?.getAttribute('aria-expanded') === 'true', controlled: Boolean(log) && toggle?.getAttribute('aria-controls') === log.id, visible:visible(log), text:log?.innerText ?? '', continueReady:visible(button) && !button.disabled};
})()`;

function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    if (ws?.readyState !== WebSocket.OPEN) return reject(new Error(`CDP unavailable: ${method}`));
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(predicate, timeout = 15000) {
  const deadline = Date.now() + timeout;
  do {
    if (await predicate()) return true;
    await Bun.sleep(100);
  } while (Date.now() < deadline);
  return false;
}
async function wait(expression, timeout = 15000) {
  if (!await until(() => evaluate(expression), timeout)) throw new Error(`Prerequisite timeout: ${expression}`);
}
function check(value, message) {
  if (!value) report.failures.push(message);
  return Boolean(value);
}
async function navigate(url, reload = false) {
  const generation = documentGeneration;
  const result = await send(reload ? "Page.reload" : "Page.navigate", reload ? {} : { url });
  if (result.errorText) throw new Error(result.errorText);
  if (!await until(() => documentGeneration > generation)) throw new Error("No new top-level document committed");
  await wait(`location.href === ${JSON.stringify(new URL(url).href)} && document.readyState === 'complete' && Boolean(document.querySelector('main'))`);
}
async function snapshot(name) {
  const state = await evaluate(`({url:location.href,title:document.title,text:document.body.innerText,fields:[...document.querySelectorAll('input,textarea')].map(e=>({tag:e.tagName,label:e.getAttribute('aria-label'),value:e.value,disabled:e.disabled})),buttons:[...document.querySelectorAll('button')].map(e=>({text:e.innerText,label:e.getAttribute('aria-label'),expanded:e.getAttribute('aria-expanded'),disabled:e.disabled})),transcript:${transcript},fixture:window.browserAuditVoice ? {calls:window.browserAuditVoice.calls,violations:window.browserAuditVoice.violations} : null,draft:localStorage.getItem('chitchat.onboarding.draft.v1')})`);
  report[name] = state;
  const image = await send("Page.captureScreenshot", { format: "png" });
  await Bun.write(`${prefix}.${name}.png`, Buffer.from(image.data, "base64"));
  return state;
}
function assertTranscript(state, name, fixture) {
  return check(state.open && state.controlled && state.visible && state.continueReady && fixture.messages.every(message => state.text.includes(message.text)), `RI-002: ${name} must retain the open visible transcript, both expected turns, and enabled Continue.`);
}
async function intercept(event) {
  const { request, requestId, networkId } = event;
  const url = new URL(request.url);
  if (request.method === "GET" && ((url.origin === "https://www.react-grab.com" && url.pathname === "/api/version") || (url.origin === "https://fonts.googleapis.com" && url.pathname === "/css2") || url.origin === "https://fonts.gstatic.com")) {
    await send("Fetch.continueRequest", { requestId });
    return;
  }
  if (textPhase && url.pathname === "/api/practice/onboarding-turns" && request.method === "POST" && requests.length < 2) {
    requests.push({ requestId, networkId, url: request.url, method: request.method, body: JSON.parse(request.postData ?? "null"), lifecycleStarted });
    return;
  }
  if (request.method === "OPTIONS") {
    await send("Fetch.fulfillRequest", { requestId, responseCode: 204, responseHeaders: [
      { name: "Access-Control-Allow-Origin", value: origin },
      { name: "Access-Control-Allow-Credentials", value: "true" },
      { name: "Access-Control-Allow-Methods", value: "POST, GET, OPTIONS" },
      { name: "Access-Control-Allow-Headers", value: "content-type, authorization" },
    ] });
    return;
  }
  errors.push({ kind: "fixture", detail: `Blocked unmatched operation ${request.method} ${request.url}` });
  await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
}
function classifyErrors() {
  report.expectedCancellations = errors.filter(error => error.kind === "network" && error.lifecycleStarted && error.detail.canceled === true && error.detail.errorText === "net::ERR_ABORTED" && requests.some(request => request.networkId === error.detail.requestId));
  report.unexpectedErrors = errors.filter(error => !report.expectedCancellations.includes(error));
}
try {
  if (!/^[a-zA-Z0-9_-]+$/.test(label) || label.startsWith("baseline")) throw new Error("Use a fresh non-baseline BROWSER_LABEL");
  for await (const existing of new Bun.Glob(`${prefix}.*`).scan(".")) throw new Error(`Refusing to overwrite evidence for ${existing}`);
  canWrite = true;
  port = process.env.CDP_PORT ?? (await Bun.file("/private/var/folders/mx/5s3lql2x70s_3_zn374w276m0000gn/T/opencode/chitchat-followups-chrome/DevToolsActivePort").text()).split("\n")[0];
  if (!/^\d+$/.test(port)) throw new Error("Invalid CDP port");
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`CDP target creation returned ${response.status}`);
  target = await response.json();
  report.target = target.id;
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP socket open timeout")), 10000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("CDP socket open failed")); };
  });
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(String(data));
    if (event.id) {
      const call = pending.get(event.id);
      if (!call) return;
      clearTimeout(call.timer);
      pending.delete(event.id);
      event.error ? call.reject(new Error(JSON.stringify(event.error))) : call.resolve(event.result);
    } else if (event.method === "Page.frameNavigated" && !event.params.frame.parentId) documentGeneration++;
    else if (event.method === "Runtime.exceptionThrown") errors.push({ kind: "runtime", detail: event.params.exceptionDetails });
    else if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") errors.push({ kind: "console", detail: event.params });
    else if (event.method === "Log.entryAdded" && event.params.entry.level === "error") errors.push({ kind: "log", detail: event.params.entry });
    else if (event.method === "Network.responseReceived" && event.params.type === "Document") report.network.push(event.params.response);
    else if (event.method === "Network.loadingFailed" && !closing) errors.push({ kind: "network", lifecycleStarted, detail: event.params });
    else if (event.method === "Fetch.requestPaused") void intercept(event.params).catch(error => errors.push({ kind: "interception", detail: String(error) }));
  };
  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable"), send("Log.enable")]);
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }, { urlPattern: "*googleapis.com*" }, { urlPattern: "*google.com*" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(origin);
  await wait("Boolean(document.querySelector('main h1'))");
  await snapshot("home");
  await navigate(`${origin}/theme`);
  await wait("Boolean(document.querySelector('main h1'))");
  await snapshot("theme");
  const draft = { version: 1, step: "motivation", language: "English", name: "Browser Audit", motivation: "I want to feel confident talking with coworkers.", skills: [], conversationMode: "text", conversation: [] };
  await evaluate(`localStorage.removeItem('chitchat.onboarding.profile.v1'); localStorage.setItem('chitchat.onboarding.draft.v1', ${JSON.stringify(JSON.stringify(draft))})`);
  textPhase = true;
  await navigate(origin);
  await wait(`${controlsReady} && ${input}.value === ${JSON.stringify(draft.motivation)}`);
  await snapshot("before");
  await evaluate(`${submit}.click()`);
  if (!await until(() => requests.length === 1)) throw new Error("No initial intercepted onboarding POST");
  check(requests[0].body?.messages?.at(-1)?.text === draft.motivation, "RI-001: initial POST must contain the seeded user turn.");
  await wait(`Boolean(${input}?.disabled && ${submit}?.disabled)`);
  await snapshot("pending");
  lifecycleStarted = true;
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))");
  const canceled = await until(() => errors.some(error => error.kind === "network" && error.detail.requestId === requests[0].networkId && error.detail.canceled && error.detail.errorText === "net::ERR_ABORTED"), 5000);
  check(canceled, "RI-001: pagehide must cancel the held POST, correlated by CDP network request ID.");
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))");
  report.lifecycle = "Synthetic persisted pagehide/pageshow in Chrome, separated by a bounded cancellation wait. This does not test actual BFCache eligibility, freezing, or navigation.";
  const recovered = await until(() => evaluate(controlsReady), 5000);
  check(recovered, "RI-001: scoped motivation textarea and Continue must recover after lifecycle restoration.");
  await snapshot("restored");
  report.textRecovered = false;
  if (recovered) {
    const retryText = "I also want to contribute confidently in team meetings.";
    await evaluate(`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(${input},${JSON.stringify(retryText)}); ${input}.dispatchEvent(new Event('input',{bubbles:true}))`);
    await wait(`${controlsReady} && ${input}.value === ${JSON.stringify(retryText)}`);
    await evaluate(`${submit}.click()`);
    const retried = await until(() => requests.length === 2, 5000);
    report.textRecovered = check(retried && requests[1].networkId !== requests[0].networkId && requests[1].body?.messages?.at(-1)?.text === retryText, "RI-001: recovered form must send a new intercepted POST containing the retry turn.");
    if (retried) {
      await wait(`Boolean(${input}?.disabled && ${submit}?.disabled)`);
      await snapshot("retry-pending");
      await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))");
      await until(() => errors.some(error => error.kind === "network" && error.detail.requestId === requests[1].networkId && error.detail.canceled), 5000);
    }
  }
  textPhase = false;
  if (process.env.BROWSER_VOICE === "1") {
    const voiceDraft = { ...draft, step: "microphone", motivation: "", conversationMode: "voice" };
    await evaluate(`localStorage.setItem('chitchat.onboarding.draft.v1', ${JSON.stringify(JSON.stringify(voiceDraft))})`);
    await send("Page.addScriptToEvaluateOnNewDocument", { source: await Bun.file(".audit/repository-followups-browser.voice.js").text() });
    await navigate(origin);
    await wait(`[...document.querySelectorAll('button')].some(e => e.innerText === 'Restart voice' && !e.disabled)`);
    await evaluate(`[...document.querySelectorAll('button')].find(e => e.innerText === 'Restart voice').click()`);
    await wait("Boolean(window.browserAuditVoice?.socket?.readyState === 1)");
    await evaluate(`document.querySelector('[data-voice-session] button[aria-expanded]').click()`);
    await wait(`(${transcript}).open && (${transcript}).visible`);
    await evaluate("window.browserAuditVoice.complete()");
    await wait(`(${transcript}).continueReady`, 15000);
    const fixture = await evaluate("({calls:window.browserAuditVoice.calls,outcome:window.browserAuditVoice.outcome,messages:window.browserAuditVoice.messages,violations:window.browserAuditVoice.violations})");
    report.voiceProviderFixture = fixture;
    if (fixture.violations.length) throw new Error(`Voice fixture violations: ${JSON.stringify(fixture.violations)}`);
    if (fixture.calls.length !== 2 || fixture.calls[0].operation !== "sessions" || fixture.calls[1].operation !== "completions") throw new Error("Expected exactly one validated token request and one validated completion request");
    assertTranscript(await evaluate(transcript), "completion", fixture);
    const voice = await snapshot("voice-completed-open");
    assertTranscript(voice.transcript, "pre-reload snapshot", fixture);
    const saved = JSON.parse(voice.draft);
    const expectedGoal = { ...fixture.outcome, reply: fixture.messages.at(-1).text };
    report.voiceGoalPersisted = check(isDeepStrictEqual(saved?.resolvedGoal, expectedGoal), "RI-002: persisted resolvedGoal must exactly equal the completed fixture turn before reload.");
    check(saved?.motivation === fixture.outcome.goal, "RI-002: persisted motivation must equal the confirmed goal.");
    check(isDeepStrictEqual(saved?.conversation, fixture.messages), "RI-002: persisted conversation must contain both exact fixture turns.");
    await navigate(origin, true);
    const copy = await Bun.file("apps/web/messages/en.json").json();
    const expectedContent = [copy.help_personalized, expectedGoal.reply, copy.benefits_pace];
    const expectedCards = ["speak_smoothly", "express_yourself", "listen_and_connect"].map(id => ({ title: copy[`help_${id}_title`], text: copy[`help_${id}_text`], detail: copy[`help_${id}_detail`] }));
    const benefitsReady = `(() => {
      const main = document.querySelector('main');
      const visible = e => Boolean(e?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
      const heading = [...(main?.querySelectorAll('h1') ?? [])].find(e => e.innerText === ${JSON.stringify(copy.heading_benefits)});
      const titles = [...(main?.querySelectorAll('h2') ?? [])].filter(visible);
      return visible(heading) && ${JSON.stringify(expectedContent)}.every(text => main.innerText.includes(text)) && titles.length === 3 && ${JSON.stringify(expectedCards)}.every(card => {
        const title = titles.find(e => e.innerText === card.title);
        return title && [card.text, card.detail].every(text => [...title.parentElement.querySelectorAll('p')].some(e => visible(e) && e.innerText === text));
      });
    })()`;
    report.voiceReloadReachedBenefits = check(await until(() => evaluate(benefitsReady), 10000), "RI-002: reload must render the visible benefits heading, personalized status, and all three expected cards with their content.");
    const reload = await snapshot("voice-reloaded");
    const restored = JSON.parse(reload.draft);
    check(restored?.step === "benefits", "RI-002: reloaded draft must persist the benefits step.");
    check(isDeepStrictEqual(restored?.resolvedGoal, expectedGoal) && isDeepStrictEqual(restored?.resolvedGoal, saved?.resolvedGoal), "RI-002: exact confirmed goal must survive reload.");
    check(restored?.motivation === fixture.outcome.goal, "RI-002: reloaded motivation must retain the confirmed goal.");
    report.voiceReloadFixture = await evaluate("({calls:window.browserAuditVoice.calls,violations:window.browserAuditVoice.violations})");
    if (report.voiceReloadFixture.calls.length || report.voiceReloadFixture.violations.length) throw new Error("Reload unexpectedly requested voice/provider work");
    report.voiceMethod = "Browser-injected silent getUserMedia, Gemini transport and validated HTTP fixtures exercise the actual React/controller persistence flow. Audio worklet execution and audible playback are not independently asserted.";
  }
} catch (error) {
  report.blocker = String(error);
  if (ws?.readyState === WebSocket.OPEN) {
    try { await snapshot("blocked"); } catch (diagnostic) { report.diagnostics.push(`Snapshot failed: ${diagnostic}`); }
  }
} finally {
  classifyErrors();
  if (report.unexpectedErrors.length) report.blocker = [report.blocker, `${report.unexpectedErrors.length} unexpected runtime/network/fixture errors`].filter(Boolean).join("; ");
  closing = true;
  if (ws?.readyState === WebSocket.OPEN) {
    try { await send("Page.close"); } catch (error) { report.diagnostics.push(`Tab cleanup failed: ${error}`); report.blocker ??= "Tab cleanup failed"; }
  } else if (target?.id) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/close/${encodeURIComponent(target.id)}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) { report.diagnostics.push(`Setup tab cleanup failed: ${error}`); report.blocker ??= "Setup tab cleanup failed"; }
  }
  ws?.close();
  for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error("Runner closed")); }
  report.exitCode = report.blocker ? 2 : report.failures.length ? 1 : 0;
  process.exitCode = report.exitCode;
  if (canWrite) {
    try { await Bun.write(`${prefix}.json`, JSON.stringify(report, null, 2)); }
    catch (error) { canWrite = false; report.blocker = `Report write failed: ${error}`; report.exitCode = 2; process.exitCode = 2; }
  }
  console.log(JSON.stringify({ exitCode: report.exitCode, blocker: report.blocker, failures: report.failures, evidence: canWrite ? `${prefix}.json` : null }, null, 2));
}
