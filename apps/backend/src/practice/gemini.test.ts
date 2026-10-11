import { readFile } from "node:fs/promises";

import type * as GeminiSdk from "@google/genai";
import type { AuthToken, CreateAuthTokenParameters } from "@google/genai";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGeminiProvider } from "./gemini";

const clientOptions = vi.hoisted(() =>
  vi.fn<(options: { apiKey?: string }) => void>()
);
const generateContent = vi.hoisted(() =>
  vi.fn<
    (
      params: GeminiSdk.GenerateContentParameters
    ) => Promise<
      Partial<Pick<GeminiSdk.GenerateContentResponse, "candidates" | "text">>
    >
  >()
);
const createToken = vi.hoisted(() =>
  vi.fn<(params: CreateAuthTokenParameters) => Promise<AuthToken>>()
);
vi.mock(import("@google/genai"), async (importOriginal) => {
  const actual = await importOriginal<typeof GeminiSdk>();
  return {
    ...actual,
    GoogleGenAI: class {
      constructor(options: { apiKey?: string }) {
        clientOptions(options);
      }
      models = { generateContent };
      authTokens = { create: createToken };
    } as unknown as typeof actual.GoogleGenAI,
  };
});
const selection = {
  personaId: "maya",
  placeId: "cafe",
  settingId: "networking",
};

describe("Gemini Live provisioning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("issues one-use credentials constrained to the selected scene and live audio model", async () => {
    createToken.mockResolvedValue({ name: "auth_tokens/short-lived" });
    const before = Date.now();
    const session = await createGeminiProvider("permanent-key").createSession(
      selection,
      new AbortController().signal
    );
    expect(session).toMatchObject({
      token: "auth_tokens/short-lived",
      model: "gemini-3.1-flash-live-preview",
    });
    expect(session.expiresAt - before).toBeGreaterThanOrEqual(900_000);
    const config = createToken.mock.calls[0]?.[0].config;
    expect(config).toMatchObject({
      uses: 1,
      lockAdditionalFields: ["tools"],
      liveConnectConstraints: {
        model: session.model,
        config: {
          responseModalities: ["AUDIO"],
          thinkingConfig: { thinkingLevel: "MINIMAL" },
          tools: [
            {
              functionDeclarations: [{ name: "end_conversation" }],
            },
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          realtimeInputConfig: {
            activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
            automaticActivityDetection: {
              disabled: false,
              silenceDurationMs: 800,
            },
          },
        },
      },
    });
    expect(config?.liveConnectConstraints?.config?.systemInstruction).toMatch(
      /Maya[\s\S]*Networking event/u
    );
    expect(
      Date.parse(config?.newSessionExpireTime ?? "") - before
    ).toBeLessThan(61_000);
  });

  it("issues a separate v1beta onboarding token that expires after three minutes", async () => {
    createToken.mockResolvedValue({ name: "auth_tokens/onboarding" });
    const before = Date.now();
    const session = await createGeminiProvider(
      "test-key"
    ).createOnboardingSession?.(
      { name: "Dale", language: "English" },
      new AbortController().signal
    );
    expect(session?.expiresAt).toBeGreaterThanOrEqual(before + 180_000);
    expect(session?.expiresAt).toBeLessThan(before + 181_000);
    expect(session).toMatchObject({
      model: "gemini-3.8-live",
      apiVersion: "v1beta",
      maxDurationMs: 180_000,
    });
    expect(clientOptions).toHaveBeenCalledWith({
      apiKey: "test-key",
      httpOptions: { apiVersion: "v1beta", timeout: 20_000 },
    });
    const config = createToken.mock.calls[0]?.[0].config;
    expect(config?.expireTime).toBe(
      new Date(session?.expiresAt ?? 0).toISOString()
    );
  });

  it("locks onboarding audio and its blocking completion tool without unsupported thinking configuration", async () => {
    createToken.mockResolvedValue({ name: "auth_tokens/onboarding" });
    await createGeminiProvider("test-key").createOnboardingSession?.(
      { name: "Dale", language: "English" },
      new AbortController().signal
    );
    const config = createToken.mock.calls[0]?.[0].config;
    expect(config).toMatchObject({
      uses: 1,
      lockAdditionalFields: ["tools"],
      liveConnectConstraints: {
        model: "gemini-3.8-live",
        config: {
          responseModalities: ["AUDIO"],
          tools: [
            {
              functionDeclarations: [
                { name: "complete_onboarding", behavior: "BLOCKING" },
              ],
            },
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    });
    expect(
      config?.liveConnectConstraints?.config?.thinkingConfig
    ).toBeUndefined();
    expect(config?.httpOptions?.extraBody?.fieldMask).toBe(
      "model,generationConfig,systemInstruction,tools,inputAudioTranscription,outputAudioTranscription,realtimeInputConfig"
    );
    const declaration = config?.liveConnectConstraints?.config?.tools?.[0];
    expect(JSON.stringify(declaration)).not.toContain('"reply"');
  });

  it("keeps scoring instructions and tools out of the live conversation", async () => {
    createToken.mockResolvedValue({ name: "auth_tokens/review" });
    const provider = createGeminiProvider("test-key");
    await Promise.all(
      ["maya", "theo"].map((personaId) =>
        provider.createSession(
          { ...selection, personaId },
          new AbortController().signal
        )
      )
    );
    const instructions = createToken.mock.calls.map(([request]) =>
      String(request.config?.liveConnectConstraints?.config?.systemInstruction)
    );
    expect(instructions[0]).toContain("You are Maya");
    expect(instructions[1]).toContain("You are Theo");
    for (const instruction of instructions) {
      expect(instruction).not.toContain("FEEDBACK PHASE");
      expect(instruction).toContain("The app provides feedback separately");
    }
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("rejects invalid choices and missing provider tokens", async () => {
    const provider = createGeminiProvider("test-key", "image-key");
    await expect(
      provider.createSession(
        { ...selection, personaId: "unknown" },
        new AbortController().signal
      )
    ).rejects.toThrow("Invalid");
    expect(createToken).not.toHaveBeenCalled();
    createToken.mockResolvedValue({});
    await expect(
      provider.createSession(selection, new AbortController().signal)
    ).rejects.toThrow("no connection token");
  });

  it("constrains Chit to Lily's voice and the place and situation tools while allowing resumption", async () => {
    createToken.mockResolvedValue({ name: "auth_tokens/chit" });
    await createGeminiProvider("test-key", "image-key").createPlaceSession?.(
      new AbortController().signal
    );
    const config = createToken.mock.calls[0]?.[0].config;
    expect(config?.liveConnectConstraints?.config).toMatchObject({
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Leda" } },
      },
      tools: [
        { functionDeclarations: [{ name: "summarize_place" }] },
        { functionDeclarations: [{ name: "summarize_situation" }] },
      ],
      systemInstruction: expect.stringContaining("You are Chit"),
    });
    expect(config?.liveConnectConstraints?.config?.systemInstruction).toContain(
      "Wait for their answer"
    );
    // SDK 2.22.0 emits tools.0 in its automatic mask, which Gemini rejects.
    const mask = config?.httpOptions?.extraBody?.fieldMask;
    expect(mask).toBe(
      "model,generationConfig,systemInstruction,tools,inputAudioTranscription,outputAudioTranscription,realtimeInputConfig,contextWindowCompression"
    );
    expect(mask).not.toContain("sessionResumption");
  });

  it("constrains a situation session to its selected place and situation-summary tool", async () => {
    createToken.mockResolvedValue({ name: "auth_tokens/situation" });
    const place = {
      name: "Restaurant",
      description: "A quiet neighborhood restaurant.",
    };
    await createGeminiProvider("test-key").createSituationSession?.(
      place,
      new AbortController().signal
    );
    const config = createToken.mock.calls[0]?.[0].config;
    expect(config?.liveConnectConstraints?.config).toMatchObject({
      tools: [{ functionDeclarations: [{ name: "summarize_situation" }] }],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Leda" } },
      },
      systemInstruction: expect.stringContaining(JSON.stringify(place)),
    });
    expect(config?.liveConnectConstraints?.config?.systemInstruction).toContain(
      "Wait for their answer"
    );
    expect(config).toMatchObject({ uses: 1, lockAdditionalFields: ["tools"] });
  });
});

describe("place image generation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests Flash Lite Image and skips thought images", async () => {
    generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                thought: true,
                inlineData: { mimeType: "image/png", data: "thought" },
              },
              { inlineData: { mimeType: "image/png", data: "final" } },
            ],
          },
        },
      ],
    });
    const { signal } = new AbortController();
    const image = await createGeminiProvider(
      "test-key",
      "image-key"
    ).generatePlaceImage?.(
      { name: "Cafe", description: "A quiet cafe." },
      signal
    );
    expect(image).toBe("data:image/png;base64,final");
    expect(clientOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "image-key" })
    );
    expect(generateContent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: "gemini-3.1-flash-lite-image",
        contents: [{ text: expect.any(String) }],
        config: expect.objectContaining({
          abortSignal: signal,
          imageConfig: { aspectRatio: "3:2", imageSize: "1K" },
        }),
      })
    );
  });

  it("rejects responses without a generated image", async () => {
    generateContent.mockResolvedValue({ candidates: [] });
    await expect(
      createGeminiProvider("test-key", "image-key").generatePlaceImage?.(
        { name: "Cafe", description: "A quiet cafe." },
        new AbortController().signal
      )
    ).rejects.toThrow("no place image");
  });

  it.each([
    { id: "maya", name: "Maya" },
    { id: "noah", name: "Noah" },
  ])(
    "attaches $name's actual avatar as a PNG reference with the selected scene",
    async ({ id, name }) => {
      generateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: "scene" } }],
            },
          },
        ],
      });
      const situation = {
        name: "A chance encounter",
        description: "Turn an everyday moment into a conversation.",
      };
      await createGeminiProvider("test-key", "image-key").generatePlaceImage?.(
        {
          name: "Cafe",
          description: "A quiet cafe.",
          scene: { situation, personaId: id },
        },
        new AbortController().signal
      );
      const svg = await readFile(
        new URL(
          `../../../web/public/images/personas/${id}.svg`,
          import.meta.url
        )
      );
      const avatar = await sharp(svg).png().toBuffer();
      expect(generateContent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contents: [
            {
              inlineData: {
                mimeType: "image/png",
                data: avatar.toString("base64"),
              },
            },
            { text: expect.stringContaining(JSON.stringify(situation)) },
          ],
        })
      );
      expect(generateContent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            { text: expect.stringContaining(`"name":"${name}"`) },
          ]),
        })
      );
      expect(generateContent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            {
              text: expect.stringContaining(
                "preserving their recognizable appearance"
              ),
            },
          ]),
        })
      );
    }
  );

  it("does not generate an image when the scene request was canceled", async () => {
    await expect(
      createGeminiProvider("test-key", "image-key").generatePlaceImage?.(
        {
          name: "Cafe",
          description: "A quiet cafe.",
          scene: {
            situation: {
              name: "A chance encounter",
              description: "Say hello.",
            },
            personaId: "maya",
          },
        },
        AbortSignal.abort(new Error("Canceled scene"))
      )
    ).rejects.toThrow("Canceled scene");
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("image credentials", () => {
  it("requires an image key instead of falling back to the primary key", async () => {
    await expect(
      createGeminiProvider("primary-key").generatePlaceImage?.(
        { name: "Cafe", description: "A quiet cafe." },
        new AbortController().signal
      )
    ).rejects.toThrow("GEMINI_API_KEY_LIVE is required");
  });
});

describe("AI scene generation", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("generates structured copy from scene context, the persona, and backstory", async () => {
    const result = {
      title: "Your first practice.",
      description: "Ryan greets you by the dugout.",
      goal: "Learn one teammate’s name.",
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: JSON.stringify(result) }],
            },
            finishReason: "STOP",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetch);
    const { signal } = new AbortController();
    const request = {
      place: { name: "Baseball field", description: "The local field." },
      situation: {
        name: "Meet the team",
        description: "Meeting the other players.",
      },
      personaId: "ryan",
      backstory: "Ryan is the captain. I am new to the team.",
    };
    await expect(
      createGeminiProvider("test-key").generateScenePreview?.(request, signal)
    ).resolves.toStrictEqual(result);
    const [call] = fetch.mock.calls;
    expect({
      url: String(call?.[0]),
      key: new Headers(call?.[1]?.headers).get("x-goog-api-key"),
    }).toMatchObject({
      url: expect.stringContaining("gemini-3.1-flash-lite:generateContent"),
      key: "test-key",
    });
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "minimal" },
    });
    expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({
      place: request.place,
      situation: request.situation,
      backstory: request.backstory,
      persona: { name: "Ryan", character: expect.any(String) },
    });
    expect(body.systemInstruction.parts[0].text).toContain(
      "Keep the description independent of the goal"
    );
  });

  it("does not generate when the request is already canceled", async () => {
    await expect(
      createGeminiProvider("test-key").generateScenePreview?.(
        {
          place: { name: "Cafe", description: "A cozy cafe." },
          situation: { name: "Say hello", description: "Meeting a neighbor." },
          personaId: "maya",
        },
        AbortSignal.abort(new Error("Canceled scene"))
      )
    ).rejects.toThrow("Canceled scene");
    expect(generateContent).not.toHaveBeenCalled();
  });
});
