import { ApiError } from "@google/genai";
import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import { createConversationModes } from "./conversation-modes";

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
function response(text: unknown) {
  return { text: JSON.stringify(text) } as Awaited<
    ReturnType<GoogleGenAI["models"]["generateContent"]>
  >;
}

describe("conversation provider fallback", () => {
  it.each(["suggestReply", "guidedTurn"] as const)(
    "recovers %s from quota limits with the secondary client",
    async (method) => {
      const primary = client();
      const secondary = client();
      primary.generateContent.mockRejectedValueOnce(
        new ApiError({ status: 429, message: "quota" })
      );
      secondary.generateContent.mockResolvedValueOnce(
        response(method === "guidedTurn" ? turn : { text: turn.reply })
      );
      const result = await createConversationModes(primary.ai, secondary.ai)[
        method
      ](request, new AbortController().signal);
      expect(result.text).toBe(
        method === "guidedTurn" ? turn.text : turn.reply
      );
      expect(primary.generateContent).toHaveBeenCalledOnce();
      expect(secondary.generateContent).toHaveBeenCalledOnce();
      expect(secondary.generateContent.mock.calls[0]).toStrictEqual(
        primary.generateContent.mock.calls[0]
      );
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
      const primary = client();
      const secondary = client();
      const error = new ApiError({ status, message: "invalid" });
      primary.generateContent.mockRejectedValueOnce(error);
      await expect(
        createConversationModes(primary.ai, secondary.ai).guidedTurn(
          request,
          new AbortController().signal
        )
      ).rejects.toBe(error);
      expect(secondary.generateContent).not.toHaveBeenCalled();
    }
  );

  it("stops after the fallback also fails", async () => {
    const primary = client();
    const secondary = client();
    const error = new ApiError({ status: 429, message: "quota" });
    primary.generateContent.mockRejectedValueOnce(error);
    secondary.generateContent.mockRejectedValueOnce(error);
    await expect(
      createConversationModes(primary.ai, secondary.ai).guidedTurn(
        request,
        new AbortController().signal
      )
    ).rejects.toBe(error);
    expect(primary.generateContent).toHaveBeenCalledOnce();
    expect(secondary.generateContent).toHaveBeenCalledOnce();
  });

  it("does not start fallback work after cancellation", async () => {
    const primary = client();
    const secondary = client();
    const pending =
      Promise.withResolvers<
        Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
      >();
    primary.generateContent.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const operation = createConversationModes(
      primary.ai,
      secondary.ai
    ).guidedTurn(request, controller.signal);
    controller.abort();
    pending.reject(new ApiError({ status: 429, message: "quota" }));
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(secondary.generateContent).not.toHaveBeenCalled();
  });
});
