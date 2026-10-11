import { ApiError } from "@google/genai";
import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import { createConversationModes } from "./conversation-modes";
import { textClient, textResponse, textError } from "./text-model.test-helper";
import type { TextGeneration } from "./text-model.test-helper";

const selection = { personaId: "maya", placeId: "cafe", settingId: "casual" };
const request = { selection, messages: [] };
const turn = { text: "Hello there!", reply: "Hello, how are you doing today?" };
function client() {
  const generateContent = vi.fn<GoogleGenAI["models"]["generateContent"]>();
  return {
    generateContent,
    ai: { models: { generateContent } } as unknown as GoogleGenAI,
  };
}

describe("conversation provider fallback", () => {
  it.each(["suggestReply", "guidedTurn"] as const)(
    "recovers %s from quota limits with the secondary client",
    async (method) => {
      const primary = textClient();
      const secondary = textClient();
      primary.generate.mockRejectedValueOnce(textError(429, "quota"));
      secondary.generate.mockResolvedValueOnce(
        textResponse(method === "guidedTurn" ? turn : { text: turn.reply })
      );
      const result = await createConversationModes(
        client().ai,
        primary.ai,
        undefined,
        secondary.ai
      )[method](request, new AbortController().signal);
      expect(result.text).toBe(
        method === "guidedTurn" ? turn.text : turn.reply
      );
      expect(primary.generate).toHaveBeenCalledOnce();
      expect(secondary.generate).toHaveBeenCalledOnce();
      expect(secondary.generate.mock.calls[0]?.[0]).toMatchObject({
        prompt: primary.generate.mock.calls[0]?.[0].prompt,
        responseFormat: primary.generate.mock.calls[0]?.[0].responseFormat,
      });
    }
  );

  it("recovers persona speech from a provider outage", async () => {
    const primary = client();
    const secondary = client();
    primary.generateContent.mockRejectedValueOnce(
      new ApiError({ status: 503, message: "busy" })
    );
    secondary.generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: { data: "AAA=", mimeType: "audio/pcm;rate=24000" },
              },
            ],
          },
        },
      ],
    } as Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>);
    const speech = await createConversationModes(
      primary.ai,
      textClient().ai,
      secondary.ai
    ).speakTurn({ selection, text: turn.text }, new AbortController().signal);
    expect(speech).toMatchObject({ text: turn.text, audio: "AAA=" });
    expect(secondary.generateContent.mock.calls[0]).toStrictEqual(
      primary.generateContent.mock.calls[0]
    );
  });

  it.each([400, 401, 403])(
    "does not retry invalid or unauthorized requests (%s)",
    async (status) => {
      const primary = textClient();
      const secondary = textClient();
      const error = textError(status, "invalid");
      primary.generate.mockRejectedValueOnce(error);
      await expect(
        createConversationModes(
          client().ai,
          primary.ai,
          undefined,
          secondary.ai
        ).guidedTurn(request, new AbortController().signal)
      ).rejects.toBe(error);
      expect(secondary.generate).not.toHaveBeenCalled();
    }
  );

  it("stops after the fallback also fails", async () => {
    const primary = textClient();
    const secondary = textClient();
    const error = textError(429, "quota");
    primary.generate.mockRejectedValueOnce(error);
    secondary.generate.mockRejectedValueOnce(error);
    await expect(
      createConversationModes(
        client().ai,
        primary.ai,
        undefined,
        secondary.ai
      ).guidedTurn(request, new AbortController().signal)
    ).rejects.toBe(error);
    expect(primary.generate).toHaveBeenCalledOnce();
    expect(secondary.generate).toHaveBeenCalledOnce();
  });

  it("does not start fallback work after cancellation", async () => {
    const primary = textClient();
    const secondary = textClient();
    const pending = Promise.withResolvers<TextGeneration>();
    const entered = Promise.withResolvers<undefined>();
    primary.generate.mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const controller = new AbortController();
    const operation = createConversationModes(
      client().ai,
      primary.ai,
      undefined,
      secondary.ai
    ).guidedTurn(request, controller.signal);
    await entered.promise;
    controller.abort();
    pending.reject(textError(429, "quota"));
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(secondary.generate).not.toHaveBeenCalled();
  });
});
