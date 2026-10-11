import type { GoogleProvider } from "@ai-sdk/google";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { vi } from "vitest";

export type TextGeneration = Awaited<
  ReturnType<MockLanguageModelV4["doGenerate"]>
>;

export function textResponse(value: unknown): TextGeneration {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    finishReason: { unified: "stop", raw: "STOP" },
    usage: {
      inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 60, text: 50, reasoning: 10 },
    },
    warnings: [],
  };
}

export function textClient() {
  const generate = vi.fn<MockLanguageModelV4["doGenerate"]>();
  const stream = vi.fn<MockLanguageModelV4["doStream"]>();
  const model = new MockLanguageModelV4({
    doGenerate: generate,
    doStream: stream,
  });
  const ai = vi.fn(() => model) as unknown as GoogleProvider;
  return { generate, stream, ai };
}

export function textStreamResponse(value: unknown, finish?: Promise<void>) {
  const text = JSON.stringify(value);
  return {
    stream: new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({ type: "text-start", id: "reply" });
        for (let index = 0; index < text.length; index += 8) {
          controller.enqueue({
            type: "text-delta",
            id: "reply",
            delta: text.slice(index, index + 8),
          });
        }
        controller.enqueue({ type: "text-end", id: "reply" });
        await finish;
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: "STOP" },
          usage: textResponse(value).usage,
        });
        controller.close();
      },
    }),
  } satisfies Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
}

export function textError(statusCode: number, message = "provider detail") {
  return new APICallError({
    statusCode,
    message,
    url: "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    requestBodyValues: {},
  });
}
