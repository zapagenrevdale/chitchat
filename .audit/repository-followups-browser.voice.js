(() => {
  const outcome = {
    status: "ready",
    goal: "Feel confident talking with coworkers.",
    suggestedSkills: [],
    benefits: { ids: ["speak-smoothly", "express-yourself", "listen-and-connect"], personalized: true },
  };
  const messages = [
    { role: "user", text: "I want to feel confident talking with coworkers." },
    { role: "assistant", text: "We'll practice confident conversations with coworkers." },
  ];
  window.browserAuditVoice = { calls: [], outcome, messages, violations: [] };
  const realFetch = window.fetch.bind(window);
  const reject = (reason) => {
    window.browserAuditVoice.violations.push(reason);
    throw new Error(`Browser audit fixture: ${reason}`);
  };
  window.fetch = async (input, options) => {
    const request = new Request(input instanceof Request ? input : new URL(input, location.href), options);
    const url = new URL(request.url);
    const operation = url.pathname === "/api/practice/onboarding-sessions" ? "sessions"
      : url.pathname === "/api/practice/onboarding-completions" ? "completions" : null;
    if (operation) {
      if (request.method !== "POST" || url.search) reject(`Unexpected method or query: ${request.method} ${url}`);
      const body = await request.clone().json();
      if (body.name !== "Browser Audit" || body.language !== "English") reject(`Unexpected ${operation} learner`);
      if (window.browserAuditVoice.calls.some(call => call.operation === operation)) reject(`Duplicate ${operation} call`);
      if (operation === "completions") {
        if (window.browserAuditVoice.calls.length !== 1) reject("Completion before session");
        if (body.outcome?.status !== outcome.status || body.outcome?.goal !== outcome.goal || !Array.isArray(body.outcome?.suggestedSkills) || body.outcome.suggestedSkills.length) reject("Unexpected completion outcome");
        if (!Array.isArray(body.messages) || body.messages.length !== 1 || body.messages[0].role !== messages[0].role || body.messages[0].text !== messages[0].text) reject("Unexpected completion transcript");
      }
      window.browserAuditVoice.calls.push({ url: request.url, method: request.method, operation, body });
      if (operation === "completions") return Response.json(outcome);
      return Response.json({ token: "auth_tokens/browser-audit-fake", model: "gemini-3.8-live", apiVersion: "v1beta", expiresAt: Date.now() + 180000, maxDurationMs: 180000 });
    }
    const developmentVersionCheck = request.method === "GET" && url.origin === "https://www.react-grab.com" && url.pathname === "/api/version";
    if (!developmentVersionCheck && (url.origin !== location.origin || /onboarding|\/api\//i.test(url.pathname))) reject(`Unmatched fetch: ${request.method} ${url}`);
    return realFetch(request);
  };
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext();
    await context.resume();
    const destination = context.createMediaStreamDestination();
    window.browserAuditVoice.inputContext = context;
    return destination.stream;
  };
  const NativeSocket = window.WebSocket;
  class FakeSocket extends EventTarget {
    static OPEN = 1;
    readyState = 0;
    bufferedAmount = 0;
    binaryType = "arraybuffer";
    constructor(url, protocols) {
      super();
      const address = new URL(url, location.href);
      if (address.hostname !== "generativelanguage.googleapis.com") {
        if (address.host === location.host) return new NativeSocket(url, protocols);
        reject(`Unmatched WebSocket: ${address}`);
      }
      if (address.protocol !== "wss:" || !address.pathname.includes("BidiGenerateContent") || ![...address.searchParams.values()].includes("auth_tokens/browser-audit-fake")) reject(`Unexpected Gemini socket: ${address}`);
      if (window.browserAuditVoice.socket) reject("Duplicate Gemini socket");
      window.browserAuditVoice.socket = this;
      setTimeout(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); }, 0);
    }
    receive(message) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })); }
    send(raw) {
      const message = JSON.parse(raw);
      if (message.setup) this.receive({ setupComplete: {} });
      if (message.toolResponse) setTimeout(() => this.receive({ serverContent: {
        outputTranscription: { text: messages[1].text, finished: true },
        modelTurn: { parts: [{ inlineData: { data: btoa(String.fromCharCode(...new Uint8Array(4800))), mimeType: "audio/pcm;rate=24000" } }] },
        turnComplete: true,
      } }), 0);
    }
    close() { this.readyState = 3; }
  }
  window.WebSocket = FakeSocket;
  window.browserAuditVoice.complete = () => {
    const socket = window.browserAuditVoice.socket;
    socket.receive({ serverContent: { inputTranscription: { text: messages[0].text, finished: true } } });
    socket.receive({ toolCall: { functionCalls: [{ id: "browser-audit-completion", name: "complete_onboarding", args: { status: outcome.status, goal: outcome.goal, suggestedSkills: outcome.suggestedSkills } }] } });
  };
})();
