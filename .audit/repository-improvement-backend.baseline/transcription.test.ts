import type * as GeminiSdk from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPracticeRoutes } from "./routes";
import { createGeminiTranscription } from "./transcription";

const createToken = vi.hoisted(() =>
  vi.fn<
    (
      params: GeminiSdk.CreateAuthTokenParameters
    ) => Promise<GeminiSdk.AuthToken>
  >()
);
vi.mock(import("@google/genai"), async (importOriginal) => {
  const actual = await importOriginal<typeof GeminiSdk>();
  return {
    ...actual,
    GoogleGenAI: class {
      authTokens = { create: createToken };
    } as unknown as typeof actual.GoogleGenAI,
  };
});
const session = {
  token: "auth_tokens/test",
  model: "gemini-3.1-flash-live-preview" as const,
  expiresAt: 123_456,
};
const origin = "https://amber.cc.local";
function request(app: ReturnType<typeof createPracticeRoutes>, from = origin) {
  return app.request("/sessions", {
    method: "POST",
    headers: { origin: from, "Content-Type": "application/json" },
    body: JSON.stringify({
      personaId: "maya",
      placeId: "cafe",
      settingId: "networking",
    }),
  });
}

describe("independent Gemini captions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("constrains one-use credentials to verbatim text transcription", async () => {
    createToken.mockResolvedValue({ name: "auth_tokens/captions" });
    const { signal } = new AbortController();
    await expect(
      createGeminiTranscription("test-server-key")(signal)
    ).resolves.toBe("auth_tokens/captions");
    expect(createToken).toHaveBeenCalledWith({
      config: {
        uses: 1,
        abortSignal: signal,
        expireTime: expect.any(String),
        newSessionExpireTime: expect.any(String),
        liveConnectConstraints: {
          model: "gemini-3.5-transcribe-live",
          config: {
            responseModalities: ["TEXT"],
            inputAudioTranscription: {
              mode: "VERBATIM",
            },
          },
        },
      },
    });
  });

  it("rejects a missing token", async () => {
    createToken.mockResolvedValue({});
    await expect(
      createGeminiTranscription("test-key")(new AbortController().signal)
    ).rejects.toThrow("Gemini returned no transcription token.");
  });

  it("attaches captions to practice while preserving the origin guard", async () => {
    const provision = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("auth_tokens/captions");
    const app = createPracticeRoutes(
      { createSession: () => Promise.resolve(session) },
      origin,
      undefined,
      provision
    );
    const denied = await request(app, "https://other.example");
    expect(denied.status).toBe(403);
    expect(provision).not.toHaveBeenCalled();
    const response = await request(app);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual({
      ...session,
      transcriptionToken: "auth_tokens/captions",
    });
  });

  it("retains Gemini practice if transcription provisioning fails", async () => {
    const app = createPracticeRoutes(
      { createSession: () => Promise.resolve(session) },
      origin,
      undefined,
      () => Promise.reject(new Error("unavailable"))
    );
    const response = await request(app);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toStrictEqual({
      ...session,
      transcriptionToken: null,
    });
  });
});
