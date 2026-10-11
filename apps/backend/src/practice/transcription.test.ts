import type * as GeminiSdk from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
function request(
  app: ReturnType<typeof createPracticeRoutes>,
  from = origin,
  signal?: AbortSignal
) {
  return app.request("/sessions", {
    method: "POST",
    signal,
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
  afterEach(() => vi.restoreAllMocks());

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

  it("omits captions when no transcription provider is configured", async () => {
    const response = await request(
      createPracticeRoutes(
        { createSession: () => Promise.resolve(session) },
        origin
      )
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toStrictEqual(session);
  });

  it("rejects a mandatory session returned after its deadline", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const provision = vi.fn<() => Promise<string>>();
    const app = createPracticeRoutes(
      {
        createSession: () => {
          deadline.abort(new DOMException("Timed out", "TimeoutError"));
          return Promise.resolve(session);
        },
      },
      origin,
      undefined,
      provision
    );
    const response = await request(app);
    expect(response.status).toBe(502);
    expect(provision).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toStrictEqual({
      error: "Couldn't connect to voice practice. Please try again.",
    });
  });

  it.each([
    { source: "overall deadline", lateToken: false },
    { source: "overall deadline", lateToken: true },
    { source: "caption cap", lateToken: false },
    { source: "caption cap", lateToken: true },
    { source: "client cancellation", lateToken: false },
    { source: "client cancellation", lateToken: true },
  ] as const)(
    "handles $source during captions (late token=$lateToken)",
    async ({ source, lateToken }) => {
      const deadline = new AbortController();
      const captionCap = new AbortController();
      const client = new AbortController();
      const reason = new DOMException("Cancelled", "AbortError");
      const timeout = vi
        .spyOn(AbortSignal, "timeout")
        .mockImplementation((milliseconds) =>
          milliseconds === 25_000 ? deadline.signal : captionCap.signal
        );
      const provision = vi.fn<(signal: AbortSignal) => Promise<string>>(
        (signal) => {
          const controller = {
            "overall deadline": deadline,
            "caption cap": captionCap,
            "client cancellation": client,
          }[source];
          controller.abort(reason);
          if (!lateToken) {
            return Promise.reject(signal.reason);
          }
          return Promise.resolve("auth_tokens/late");
        }
      );
      const app = createPracticeRoutes(
        { createSession: () => Promise.resolve(session) },
        origin,
        undefined,
        provision
      );
      const response = await request(app, origin, client.signal);
      expect(timeout.mock.calls).toStrictEqual([[25_000], [5000]]);
      expect(provision).toHaveBeenCalledOnce();
      const suppliedSignal = provision.mock.calls[0]?.[0];
      expect(suppliedSignal).toMatchObject({ aborted: true, reason });
      expect(response.status).toBe(
        source === "client cancellation" ? 502 : 201
      );
      await expect(response.json()).resolves.toStrictEqual(
        source === "client cancellation"
          ? { error: "Couldn't connect to voice practice. Please try again." }
          : { ...session, transcriptionToken: null }
      );
    }
  );
});
