import { createApp } from "./app";
import { auth } from "./auth";
import { env } from "./env";
import { createGeminiProvider } from "./practice/gemini";
import { createGeminiTranscription } from "./practice/transcription";
import { createTelemetry } from "./telemetry";

const telemetry = createTelemetry(env);
const liveApiKey = env.GEMINI_API_KEY || env.GEMINI_API_KEY_LIVE;
const app = createApp({
  practiceProvider: liveApiKey
    ? createGeminiProvider(
        liveApiKey,
        env.GEMINI_API_KEY_LIVE,
        telemetry?.practice,
        env.TYPESAFE_API_KEY
      )
    : undefined,
  createTranscriptionSession: liveApiKey
    ? createGeminiTranscription(liveApiKey)
    : undefined,
  practiceTracing: telemetry?.practice,
  webOrigin: env.WEB_ORIGIN,
  authHandler: (request) => auth.handler(request),
  getUser: async (headers) => {
    const session = await auth.api.getSession({ headers });
    return session?.user ?? null;
  },
});

export default { port: env.PORT, fetch: app.fetch };

async function shutdown() {
  await telemetry?.shutdown();
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
