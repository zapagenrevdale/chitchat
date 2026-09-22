import { ApiError } from "@google/genai";
import type { GoogleGenAI } from "@google/genai";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createConversationModes } from "./conversation-modes";
import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const selection = {
  personaId: "maya",
  placeId: "cafe",
  settingId: "networking",
};
type Generation = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

const operations = [
  {
    path: "/reply-suggestions",
    body: { selection, messages: [] },
    deadline: 25_000,
  },
  {
    path: "/guided-turns",
    body: { selection, messages: [] },
    deadline: 25_000,
  },
  {
    path: "/turn-speech",
    body: { selection, text: "Hello!" },
    deadline: 50_000,
  },
];

function client() {
  const generateContent = vi.fn<GoogleGenAI["models"]["generateContent"]>();
  return {
    generateContent,
    ai: { models: { generateContent } } as unknown as GoogleGenAI,
  };
}

function generated(): Generation {
  return {
    text: JSON.stringify({ text: "Hello!", reply: "Nice to meet you." }),
    candidates: [
      {
        content: {
          parts: [
            { inlineData: { data: "AAA=", mimeType: "audio/pcm;rate=24000" } },
          ],
        },
      },
    ],
  } as Generation;
}

function setup() {
  const primary = client();
  const fallback = client();
  const provider = {
    createSession: vi.fn<PracticeProvider["createSession"]>(),
    ...createConversationModes(primary.ai, fallback.ai),
  };
  const app = new Hono().route(
    "/api/practice",
    createPracticeRoutes(provider, origin)
  );
  const post = (path: string, body: unknown, signal?: AbortSignal) =>
    app.request(`/api/practice${path}`, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  return { primary, fallback, post };
}

describe("conversation requests through provider fallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(operations)(
    "recovers $path within one shared deadline",
    async ({ path, body, deadline }) => {
      const { primary, fallback, post } = setup();
      const timeout = vi.spyOn(AbortSignal, "timeout");
      primary.generateContent.mockRejectedValueOnce(
        new ApiError({ status: 429, message: "quota" })
      );
      fallback.generateContent.mockResolvedValueOnce(generated());
      const response = await post(path, body);
      expect({
        status: response.status,
        cache: response.headers.get("Cache-Control"),
      }).toStrictEqual({ status: 200, cache: "no-store" });
      expect(timeout).toHaveBeenCalledExactlyOnceWith(deadline);
      expect({
        primary: primary.generateContent.mock.calls.length,
        fallback: fallback.generateContent.mock.calls.length,
      }).toStrictEqual({ primary: 1, fallback: 1 });
      expect(
        fallback.generateContent.mock.calls[0]?.[0].config?.abortSignal
      ).toBe(primary.generateContent.mock.calls[0]?.[0].config?.abortSignal);
      await expect(response.json()).resolves.toMatchObject({ text: "Hello!" });
    }
  );

  it.each(operations)(
    "preserves exhausted quota on $path",
    async ({ path, body }) => {
      const { primary, fallback, post } = setup();
      const error = new ApiError({
        status: 429,
        message: "private provider detail",
      });
      primary.generateContent.mockRejectedValueOnce(error);
      fallback.generateContent.mockRejectedValueOnce(error);
      const response = await post(path, body);
      expect(response.status).toBe(429);
      const result = await response.text();
      expect(result).toContain("usage limit");
      expect(result).not.toContain("private provider detail");
      expect(fallback.generateContent).toHaveBeenCalledOnce();
    }
  );

  it.each(operations)(
    "rejects malformed $path output without fallback",
    async ({ path, body }) => {
      const { primary, fallback, post } = setup();
      primary.generateContent.mockResolvedValueOnce({
        text: "{}",
      } as Generation);
      const response = await post(path, body);
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toStrictEqual({
        error: "Couldn't prepare this turn. Please try again.",
      });
      expect(fallback.generateContent).not.toHaveBeenCalled();
    }
  );

  it.each(operations)(
    "discards $path output after its deadline",
    async ({ path, body, deadline }) => {
      const { primary, post } = setup();
      const timeout = new AbortController();
      const expired = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(timeout.signal);
      const entered = Promise.withResolvers<undefined>();
      const pending = Promise.withResolvers<Generation>();
      primary.generateContent.mockImplementationOnce(() => {
        entered.resolve();
        return pending.promise;
      });
      const request = post(path, body);
      await entered.promise;
      expect(expired).toHaveBeenCalledExactlyOnceWith(deadline);
      timeout.abort(new DOMException("Expired", "TimeoutError"));
      pending.resolve(generated());
      const response = await request;
      expect(response.status).toBe(502);
    }
  );

  it("cancels a fallback already in flight and rejects its late result", async () => {
    const { primary, fallback, post } = setup();
    primary.generateContent.mockRejectedValueOnce(
      new ApiError({ status: 503, message: "busy" })
    );
    const entered = Promise.withResolvers<undefined>();
    const pending = Promise.withResolvers<Generation>();
    fallback.generateContent.mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const controller = new AbortController();
    const request = post(
      "/guided-turns",
      { selection, messages: [] },
      controller.signal
    );
    await entered.promise;
    controller.abort();
    expect(
      fallback.generateContent.mock.calls[0]?.[0].config?.abortSignal?.aborted
    ).toBeTruthy();
    pending.resolve(generated());
    const response = await request;
    expect(response.status).toBe(502);
    expect(fallback.generateContent).toHaveBeenCalledOnce();
  });

  it("does not begin fallback after the request is cancelled", async () => {
    const { primary, fallback, post } = setup();
    const entered = Promise.withResolvers<undefined>();
    const pending = Promise.withResolvers<Generation>();
    primary.generateContent.mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const controller = new AbortController();
    const request = post(
      "/guided-turns",
      { selection, messages: [] },
      controller.signal
    );
    await entered.promise;
    controller.abort();
    pending.reject(new ApiError({ status: 429, message: "quota" }));
    const response = await request;
    expect(response.status).toBe(502);
    expect(fallback.generateContent).not.toHaveBeenCalled();
  });
});
