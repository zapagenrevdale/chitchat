(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/onboarding-sessions")) {
      return new Response(JSON.stringify({
        token: "auth_tokens/browser-fixture",
        model: "gemini-3.8-live",
        apiVersion: "v1beta",
        expiresAt: Date.now() + 180000,
        maxDurationMs: 180000,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, options);
  };
  const inputContext = new AudioContext();
  const silentInput = inputContext.createMediaStreamDestination();
  navigator.mediaDevices.getUserMedia = async () => silentInput.stream;
  class FixtureSocket extends EventTarget {
    static OPEN = 1;
    readyState = 0;
    bufferedAmount = 0;
    constructor() {
      super();
      window.__syncSocket = this;
      setTimeout(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      }, 0);
    }
    send(raw) {
      const message = JSON.parse(raw);
      if (message.setup) {
        setTimeout(() => this.message({ setupComplete: {} }), 0);
      }
    }
    close() {
      this.readyState = 3;
    }
    message(message) {
      this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
    }
  }
  window.WebSocket = FixtureSocket;
  window.__syncReply = (timed = true) => {
    const bytes = new Uint8Array(24000 * 2 * 3);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    window.__syncSocket.message({ serverContent: {
      outputTranscription: {
        text: "Hello there.",
        ...(timed ? { words: [
          { text: "Hello", startOffset: "0s", endOffset: "0.5s" },
          { text: "there.", startOffset: "0.5s", endOffset: "2s" },
        ] } : {}),
      },
      modelTurn: { parts: [{ inlineData: {
        data: btoa(binary), mimeType: "audio/pcm;rate=24000",
      } }] },
      generationComplete: true,
      turnComplete: true,
    } });
  };
  return "Installed synthetic session and silent microphone fixture in this browser only.";
})()
