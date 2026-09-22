import type {
  PracticeAssessment,
  PracticeFeedbackRequest,
} from "@chitchat/contracts";
import { GenerateContentResponse } from "@google/genai";
import type { GoogleGenAI } from "@google/genai";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { finalizeFeedback } from "./feedback";
import { createFeedbackProvider } from "./review";
import { PracticeTracing } from "./tracing";

const request: PracticeFeedbackRequest = {
  selection: { personaId: "maya", placeId: "cafe", settingId: "casual" },
  messages: [{ id: 1, speaker: "user", text: "I walk by the lake." }],
};
const assessment: PracticeAssessment = {
  summary: "You shared a detail about your walks.",
  curiosity: { score: 3, note: "You asked about my walks." },
  listening: { score: 4, note: "You responded to the lake detail." },
  sharing: { score: 5, note: "Your walks gave me something to respond to." },
  highlight: {
    messageId: 1,
    quote: "I walk by the lake.",
    note: "Your lake walks gave us something in common.",
  },
  nextStep: { tip: "Ask about my favorite part of the lake." },
};
function textResponse(value: unknown) {
  const response = new GenerateContentResponse();
  response.candidates = [
    { content: { parts: [{ text: JSON.stringify(value) }] } },
  ];
  response.usageMetadata = {
    promptTokenCount: 100,
    candidatesTokenCount: 50,
    thoughtsTokenCount: 10,
  };
  return response;
}
function audioResponse(mimeType = "audio/l16; rate=24000; channels=1") {
  const response = new GenerateContentResponse();
  response.candidates = [
    {
      content: {
        parts: [
          { inlineData: { data: "AAE=", mimeType } },
          { inlineData: { data: "AgM=", mimeType } },
        ],
      },
    },
  ];
  return response;
}
const generateContent = vi.fn<GoogleGenAI["models"]["generateContent"]>();
const ai = { models: { generateContent } } as unknown as GoogleGenAI;
let exporter: InMemorySpanExporter;
let tracer: NodeTracerProvider;
let tracing: PracticeTracing;

describe("transcript assessment and TTS", () => {
  beforeEach(() => {
    generateContent.mockReset();
    exporter = new InMemorySpanExporter();
    tracer = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    setLangfuseTracerProvider(tracer);
    tracing = new PracticeTracing();
  });
  afterEach(async () => {
    tracing.close();
    await tracer.shutdown();
    setLangfuseTracerProvider(null);
  });

  it("traces the complete scorer input and validated result in the practice session", async () => {
    const session = await tracing.provision(
      {
        model: "gemini-3.1-flash-live-preview",
        voiceName: "Kore",
        systemInstruction: "Hello",
        tools: [],
      },
      () =>
        Promise.resolve({
          model: "gemini-3.1-flash-live-preview",
          token: "secret",
          expiresAt: Date.now() + 900_000,
        })
    );
    generateContent.mockResolvedValueOnce(textResponse({ assessment }));
    const result = await createFeedbackProvider(ai, tracing).assessConversation(
      { ...request, tracingToken: session.tracingToken },
      new AbortController().signal
    );
    expect(result).toMatchObject({ score: 8, status: "scored" });
    const params = generateContent.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      contents: expect.stringContaining(request.messages[0]?.text ?? "missing"),
      config: {
        systemInstruction: expect.stringContaining("you have no audio"),
      },
    });
    await tracer.forceFlush();
    const span = exporter
      .getFinishedSpans()
      .find((item) => item.name === "assess-practice-transcript");
    expect(span?.attributes["session.id"]).toBe(
      tracing.sessionId(session.tracingToken)
    );
    const attributes = JSON.stringify(span?.attributes);
    expect([
      attributes.includes("transcript-v1"),
      attributes.includes("I walk by the lake."),
      attributes.includes('\\"score\\":8'),
      attributes.includes(session.tracingToken ?? "missing"),
    ]).toStrictEqual([true, true, true, false]);
  });

  it.each([
    { ...assessment, curiosity: { score: 7, note: "Wrong scale" } },
    {
      ...assessment,
      highlight: { ...assessment.highlight, quote: "Invented quote" },
    },
  ])(
    "rejects invalid model assessments before returning them",
    async (invalid) => {
      generateContent.mockResolvedValueOnce(
        textResponse({ assessment: invalid })
      );
      await expect(
        createFeedbackProvider(ai).assessConversation(
          request,
          new AbortController().signal
        )
      ).rejects.toThrow(/score|highlight|abort/iu);
    }
  );

  it("allows insufficient evidence and rejects an aborted assessment", async () => {
    generateContent.mockResolvedValue(textResponse({ assessment: null }));
    const provider = createFeedbackProvider(ai);
    await expect(
      provider.assessConversation(request, new AbortController().signal)
    ).resolves.toStrictEqual({ status: "insufficient" });
    await expect(
      provider.assessConversation(request, AbortSignal.abort())
    ).rejects.toThrow(/score|highlight|abort/iu);
  });

  it("speaks confirmed text in the selected character's voice without another assessment", async () => {
    generateContent.mockResolvedValueOnce(audioResponse());
    const feedback = finalizeFeedback(assessment, request.messages);
    const result = await createFeedbackProvider(ai).speakFeedback(
      { selection: request.selection, feedback: { ...feedback, score: 10 } },
      new AbortController().signal
    );
    expect(result).toMatchObject({
      text: expect.stringContaining("8 out of ten"),
      audio: "AAECAw==",
    });
    expect(generateContent).toHaveBeenCalledOnce();
    const params = generateContent.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      contents: expect.stringMatching(/Speak as Maya.*Personality:/u),
      config: {
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
      },
    });
    await tracer.forceFlush();
    const attributes = JSON.stringify(
      exporter.getFinishedSpans().map((span) => span.attributes)
    );
    expect(attributes).toContain(result.text);
    expect(attributes).not.toContain(result.audio);
  });

  it("speaks an insufficient-evidence recap without a score", async () => {
    generateContent.mockResolvedValueOnce(audioResponse());
    const result = await createFeedbackProvider(ai).speakFeedback(
      { selection: request.selection, feedback: { status: "insufficient" } },
      new AbortController().signal
    );
    expect(result.text).not.toContain("score");
    expect(result.text).toContain("few more");
  });

  it.each([
    "audio/mp3",
    "audio/pcm;rate=16000",
    "audio/l16; rate=24000; channels=2",
  ])("rejects unsupported TTS audio %s", async (mimeType) => {
    generateContent.mockResolvedValueOnce(audioResponse(mimeType));
    await expect(
      createFeedbackProvider(ai).speakFeedback(
        {
          selection: request.selection,
          feedback: { status: "insufficient" },
        },
        new AbortController().signal
      )
    ).rejects.toThrow("supported recap audio");
  });
});
