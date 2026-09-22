import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const selection = {
  personaId: "maya",
  placeId: "cafe",
  settingId: "networking",
};
function setup() {
  const provider = {
    createSession: vi.fn<PracticeProvider["createSession"]>(),
    suggestReply: vi
      .fn<NonNullable<PracticeProvider["suggestReply"]>>()
      .mockResolvedValue({ text: "What do you enjoy about your work?" }),
    guidedTurn: vi
      .fn<NonNullable<PracticeProvider["guidedTurn"]>>()
      .mockResolvedValue({ text: "Hello!", reply: "Nice to meet you." }),
    speakTurn: vi
      .fn<NonNullable<PracticeProvider["speakTurn"]>>()
      .mockResolvedValue({
        text: "Hello!",
        audio: "AAA=",
        mimeType: "audio/pcm;rate=24000",
      }),
    assessConversation:
      vi.fn<NonNullable<PracticeProvider["assessConversation"]>>(),
  };
  const transcribe = vi
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockResolvedValue("auth_tokens/test");
  const app = createPracticeRoutes(provider, origin, undefined, transcribe);
  function post(path: string, body: unknown, from = origin) {
    return app.request(path, {
      method: "POST",
      headers: { origin: from, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return { provider, transcribe, post };
}
describe("conversation mode routes", () => {
  it("validates reply requests, origin, and generated output", async () => {
    const { post, provider } = setup();
    const body = {
      selection,
      messages: [{ id: 0, speaker: "partner", text: "Hello" }],
    };
    const wrongOrigin = await post(
      "/reply-suggestions",
      body,
      "https://elsewhere.test"
    );
    const invalid = await post("/reply-suggestions", {
      ...body,
      previous: "x".repeat(241),
    });
    expect(wrongOrigin.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(provider.suggestReply).not.toHaveBeenCalled();
    const success = await post("/reply-suggestions", body);
    expect(success.status).toBe(200);
    provider.suggestReply.mockResolvedValueOnce({ text: "" });
    const malformed = await post("/reply-suggestions", body);
    expect(malformed.status).toBe(502);
  });

  it("preserves provider rate limits without exposing provider details", async () => {
    const { post, provider } = setup();
    provider.suggestReply.mockRejectedValueOnce(
      new ApiError({ status: 429, message: "secret-provider-detail" })
    );
    const response = await post("/reply-suggestions", {
      selection,
      messages: [{ id: 0, speaker: "partner", text: "Hello" }],
    });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toStrictEqual({
      error:
        "Reply suggestions have reached their usage limit. You can keep talking and try suggestions later.",
    });
  });

  it.each(["/guided-turns", "/turn-speech"])(
    "preserves an exhausted Guided quota on %s",
    async (path) => {
      const { post, provider } = setup();
      const error = new ApiError({
        status: 429,
        message: "secret-provider-detail",
      });
      provider.guidedTurn.mockRejectedValueOnce(error);
      provider.speakTurn.mockRejectedValueOnce(error);
      const response = await post(
        path,
        path === "/turn-speech"
          ? { selection, text: "Hello!" }
          : { selection, messages: [] }
      );
      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toStrictEqual({
        error:
          "Guided practice has reached its usage limit. Please try again later or switch to Free talk.",
      });
    }
  );

  it("supports Guided turns, skip, and bounded speech", async () => {
    const { post, provider } = setup();
    const turn = await post("/guided-turns", {
      selection,
      messages: [],
      skipped: true,
    });
    expect(turn.status).toBe(200);
    expect(provider.guidedTurn).toHaveBeenCalledWith(
      expect.objectContaining({ skipped: true }),
      expect.any(AbortSignal)
    );
    const speech = await post("/turn-speech", { selection, text: "Hello!" });
    const oversized = await post("/turn-speech", {
      selection,
      text: "x".repeat(601),
    });
    expect(speech.status).toBe(200);
    expect(oversized.status).toBe(400);
  });

  it("provisions STT without starting an audio conversation", async () => {
    const { post, provider, transcribe } = setup();
    const provision = await post("/transcription-sessions", {});
    expect(provision.status).toBe(201);
    expect(transcribe).toHaveBeenCalledOnce();
    expect(provider.createSession).not.toHaveBeenCalled();
  });

  it("never scores supplied Guided replies as independent conversation", async () => {
    const { post, provider } = setup();
    const response = await post("/feedback", {
      selection: { ...selection, mode: "guided" },
      messages: Array.from({ length: 8 }, (_, id) => ({
        id,
        speaker: id % 2 ? "user" : "partner",
        text: "I am following a prepared reply in this conversation.",
      })),
    });
    await expect(response.json()).resolves.toStrictEqual({
      status: "insufficient",
    });
    expect(provider.assessConversation).not.toHaveBeenCalled();
  });
});
