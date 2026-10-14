import { practiceTraceBatchSchema } from "@chitchat/contracts";
import { ApiError } from "@google/genai";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPracticeRoutes } from "./routes";
import { traceGeneration, PracticeTracing } from "./tracing";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;
let tracing: PracticeTracing;
const origin = "https://chitchat.local";
const input = {
  model: "gemini-3.1-flash-live-preview",
  voiceName: "Kore",
  systemInstruction: "Say hello. End after mutual goodbyes.",
  tools: [],
};
async function provision() {
  return await tracing.provision(input, () =>
    Promise.resolve({
      token: "auth_tokens/do-not-export",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: Date.now() + 900_000,
    })
  );
}

describe("practice traces", () => {
  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    setLangfuseTracerProvider(provider);
    tracing = new PracticeTracing();
  });
  afterEach(async () => {
    tracing.close();
    await provider.shutdown();
    setLangfuseTracerProvider(null);
    vi.useRealTimers();
  });

  it("records bounded raw Live usage without inventing cost totals", async () => {
    const session = await provision();
    const event = {
      type: "usage",
      usage: {
        promptTokenCount: 100,
        responseTokenCount: 30,
        promptTokensDetails: [{ modality: "AUDIO", tokenCount: 90 }],
      },
      sequence: 0,
      timestamp: Date.now(),
    };
    const batch = practiceTraceBatchSchema.parse({
      tracingToken: session.tracingToken,
      events: [event],
    });
    expect(tracing.ingest(batch)).toBe("accepted");
    const span = exporter
      .getFinishedSpans()
      .find(({ name }) => name === "live.usage");
    expect(span?.attributes["langfuse.observation.input"]).toContain(
      '"promptTokenCount":100'
    );
    expect(
      practiceTraceBatchSchema.safeParse({
        ...batch,
        events: [{ ...event, usage: { promptTokenCount: -1 } }],
      }).success
    ).toBeFalsy();
  });

  it("links provisioning, transcripts, rejected and accepted tools, and closure without exporting credentials", async () => {
    const session = await provision();
    const batch = practiceTraceBatchSchema.parse({
      tracingToken: session.tracingToken,
      events: [
        {
          type: "transcript",
          speaker: "user",
          text: "Yep. See ya.",
          messageId: 1,
          sequence: 0,
          timestamp: Date.now(),
        },
        {
          type: "transcript",
          speaker: "partner",
          text: "See you later!",
          messageId: 2,
          sequence: 1,
          timestamp: Date.now(),
        },
        {
          type: "tool",
          name: "end_conversation",
          arguments: '{"reason":"silence"}',
          accepted: false,
          sequence: 2,
          timestamp: Date.now(),
        },
        {
          type: "tool",
          name: "end_conversation",
          arguments: '{"reason":"mutual_goodbye"}',
          accepted: true,
          sequence: 3,
          timestamp: Date.now(),
        },
        {
          type: "lifecycle",
          name: "closed",
          detail: "mutual_goodbye",
          sequence: 4,
          timestamp: Date.now(),
        },
      ],
    });
    expect(tracing.ingest(batch)).toBe("accepted");
    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    expect({
      names: spans.map((span) => span.name),
      sessions: new Set(spans.map((span) => span.attributes["session.id"]))
        .size,
      traces: new Set(spans.map((span) => span.spanContext().traceId)).size,
    }).toMatchObject({
      names: expect.arrayContaining([
        "practice.live",
        "practice.turn",
        "end_conversation",
      ]),
      sessions: 1,
      traces: 2,
    });
    const data = JSON.stringify(spans.map((span) => span.attributes));
    expect([
      data.includes("mutual_goodbye"),
      data.includes("Yep. See ya."),
      data.includes("false"),
    ]).toStrictEqual([true, true, true]);
    expect([
      data.includes("auth_tokens/do-not-export"),
      data.includes(session.tracingToken ?? "missing"),
    ]).toStrictEqual([false, false]);
    expect(tracing.ingest(batch)).toBe("unknown");
  });

  it.each([
    { environment: "development", bypass: true, expected: "accepted" },
    { environment: "development", bypass: false, expected: "limited" },
    { environment: "production", bypass: true, expected: "limited" },
  ])(
    "applies tracing quotas with $environment and bypass=$bypass",
    async ({ environment, bypass, expected }) => {
      vi.useFakeTimers();
      tracing = new PracticeTracing({ environment, bypass });
      const session = await provision();
      const batch = practiceTraceBatchSchema.parse({
        tracingToken: session.tracingToken,
        events: Array.from({ length: 8 }, () => ({
          type: "lifecycle",
          name: "connected",
          sequence: 0,
          timestamp: Date.now(),
        })),
      });
      const ingestMany = (count: number) =>
        Array.from({ length: count }, () => tracing.ingest(batch));
      expect(
        ingestMany(30).every((result) => result === "accepted")
      ).toBeTruthy();
      expect(tracing.ingest(batch)).toBe(expected);
      await vi.advanceTimersByTimeAsync(60_001);
      for (let minute = 0; minute < 7; minute += 1) {
        ingestMany(30);
        vi.advanceTimersByTime(60_001);
      }
      ingestMany(10);
      expect(tracing.ingest(batch)).toBe(expected);
      expect(tracing.ingest({ ...batch, tracingToken: "invalid" })).toBe(
        "unknown"
      );
      await vi.advanceTimersByTimeAsync(960_001);
      expect(tracing.ingest(batch)).toBe("unknown");
    }
  );

  it("marks abandoned sessions incomplete and removes their capabilities", async () => {
    vi.useFakeTimers();
    const session = await provision();
    await vi.advanceTimersByTimeAsync(960_001);
    expect(
      tracing.ingest({ tracingToken: session.tracingToken ?? "", events: [] })
    ).toBe("unknown");
    expect(
      JSON.stringify(exporter.getFinishedSpans().map((span) => span.attributes))
    ).toContain("telemetry_expired");
  });

  it("records sanitized failures and preserves the original provider error", async () => {
    const failure = new Error("secret-token-in-provider-url");
    await expect(
      tracing.provision(input, () => Promise.reject(failure))
    ).rejects.toBe(failure);
    await expect(
      traceGeneration("setup", { model: "gemini" }, () =>
        Promise.reject(failure)
      )
    ).rejects.toBe(failure);
    const data = JSON.stringify(
      exporter.getFinishedSpans().map((span) => span.attributes)
    );
    expect(data).toContain("ERROR");
    expect(data).not.toContain(failure.message);
  });

  it("records the provider HTTP status without exporting its error message", async () => {
    const failure = new ApiError({
      status: 503,
      message: "secret-token-in-provider-url",
    });
    await expect(
      traceGeneration("scene-preview", { model: "gemini" }, () =>
        Promise.reject(failure)
      )
    ).rejects.toBe(failure);
    const data = JSON.stringify(
      exporter.getFinishedSpans().map((span) => span.attributes)
    );
    expect(data).toContain("Gemini request failed (HTTP 503)");
    expect(data).not.toContain(failure.message);
  });

  it("requires the issued capability and origin, validates payloads, and keeps telemetry outside provisioning rate limits", async () => {
    const session = await provision();
    const app = createPracticeRoutes(undefined, origin, tracing);
    const event = {
      type: "lifecycle",
      name: "connected",
      sequence: 0,
      timestamp: Date.now(),
    };
    const post = (body: unknown, from = origin) =>
      app.request("/trace-events", {
        method: "POST",
        headers: { origin: from, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const responses = await Promise.all([
      post(
        { tracingToken: session.tracingToken, events: [event] },
        "https://other.example"
      ),
      post({ tracingToken: crypto.randomUUID(), events: [event] }),
      post({
        tracingToken: session.tracingToken,
        events: [{ ...event, name: "invented" }],
      }),
    ]);
    expect(responses.map((response) => response.status)).toStrictEqual([
      403, 404, 400,
    ]);
    const telemetryResponses = await Promise.all(
      Array.from({ length: 31 }, () =>
        post({ tracingToken: session.tracingToken, events: [event] })
      )
    );
    expect(
      telemetryResponses.every((response) => response.status === 204)
    ).toBeTruthy();
    const provisionResponse = await app.request("/sessions", {
      method: "POST",
      headers: { origin },
      body: "{}",
    });
    expect(provisionResponse.status).toBe(503);
    const batch = practiceTraceBatchSchema.parse({
      tracingToken: session.tracingToken,
      events: Array.from({ length: 8 }, () => event),
    });
    for (let index = 0; index < 26; index += 1) {
      expect(tracing.ingest(batch)).toBe("accepted");
    }
    expect(tracing.ingest(batch)).toBe("limited");
  });
});
