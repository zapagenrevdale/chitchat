import { LangfuseSpanProcessor } from "@langfuse/otel";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { PracticeTracing } from "./practice/tracing";

export function createTelemetry(config: {
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL: string;
  NODE_ENV: string;
  DEV_BYPASS_LIMITS?: boolean;
}) {
  if (!config.LANGFUSE_PUBLIC_KEY || !config.LANGFUSE_SECRET_KEY) {
    return;
  }
  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: config.LANGFUSE_PUBLIC_KEY,
        secretKey: config.LANGFUSE_SECRET_KEY,
        baseUrl: config.LANGFUSE_BASE_URL,
        environment: config.NODE_ENV,
        mediaUploadEnabled: false,
        timeout: 5,
        exportMode: "batched",
      }),
    ],
  });
  setLangfuseTracerProvider(provider);
  const practice = new PracticeTracing({
    environment: config.NODE_ENV,
    bypass: config.DEV_BYPASS_LIMITS ?? false,
  });
  return {
    practice,
    async shutdown() {
      practice.close();
      await provider.shutdown();
    },
  };
}
