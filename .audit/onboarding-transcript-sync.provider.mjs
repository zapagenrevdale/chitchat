import { GoogleGenAI } from "../apps/backend/node_modules/@google/genai/dist/node/index.mjs";
import { createOnboardingLiveSession } from "../apps/backend/src/practice/onboarding-live.ts";

const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_LIVE;
if (!apiKey) {
  console.log(JSON.stringify({ status: "blocked", reason: "No backend Gemini credential available." }));
  process.exit(0);
}
const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });
const probe = {
  authTokens: {
    create(request) {
      request.config.liveConnectConstraints.config.outputAudioTranscription = { wordTimestamp: true };
      return ai.authTokens.create(request);
    },
  },
};
try {
  const session = await createOnboardingLiveSession(
    probe, { name: "Fixture", language: "English" }, AbortSignal.timeout(20000)
  );
  const url = new URL("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained");
  url.searchParams.set("access_token", session.token);
  const turns = [{ audioSamples: 0, transcriptions: [] }];
  const result = await new Promise((resolve) => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    const finish = (status, reason) => {
      clearTimeout(timeout);
      socket.close();
      resolve({ status, reason, model: session.model, turns });
    };
    const timeout = setTimeout(() => finish("inconclusive", "Provider capture timed out."), 35000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ setup: { model: `models/${session.model}` } })));
    socket.addEventListener("error", () => finish("blocked", "Provider socket failed."));
    socket.addEventListener("message", async ({ data }) => {
      const raw = typeof data === "string" ? data : new TextDecoder().decode(data);
      const event = JSON.parse(raw);
      if (event.error) {
        finish("blocked", "Provider returned a session error.");
        return;
      }
      if (event.setupComplete) {
        socket.send(JSON.stringify({ realtimeInput: { text: "Ask me one brief question about my conversation goal." } }));
      }
      const content = event.serverContent;
      if (!content) return;
      const turn = turns.at(-1);
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) turn.audioSamples += Buffer.from(part.inlineData.data, "base64").length / 2;
      }
      if (content.outputTranscription) {
        const { text, words, startOffset, endOffset } = content.outputTranscription;
        turn.transcriptions.push({ text, words, startOffset, endOffset });
      }
      if (content.turnComplete) {
        if (turns.length === 2) {
          finish("captured");
        } else {
          turns.push({ audioSamples: 0, transcriptions: [] });
          socket.send(JSON.stringify({ realtimeInput: { text: "Please ask that question again in fewer words. I have not chosen my goal yet." } }));
        }
      }
    });
  });
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.log(JSON.stringify({ status: "blocked", reason: "Provider token provisioning failed." }));
}
