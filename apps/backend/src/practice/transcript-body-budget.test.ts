import type { PracticeFeedbackRequest } from "@chitchat/contracts";
import { describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const transcript: PracticeFeedbackRequest = {
  selection: { personaId: "theo", placeId: "cafe", settingId: "casual" },
  messages: Array.from({ length: 300 }, (_, id) => ({
    id,
    speaker: id % 2 === 0 ? "user" : "partner",
    text: "你好世界".repeat(50),
    suggestionShown: false,
  })),
};

describe.each([
  { path: "/feedback", result: { status: "insufficient" as const } },
  { path: "/reply-suggestions", result: { text: "How was your walk?" } },
  {
    path: "/guided-turns",
    result: { text: "A lovely walk.", reply: "Where did you go?" },
  },
] as const)("transcript body budget for $path", ({ path, result }) => {
  function setup() {
    const assessConversation = vi
      .fn<NonNullable<PracticeProvider["assessConversation"]>>()
      .mockResolvedValue({ status: "insufficient" });
    const suggestReply = vi
      .fn<NonNullable<PracticeProvider["suggestReply"]>>()
      .mockResolvedValue({ text: "How was your walk?" });
    const guidedTurn = vi
      .fn<NonNullable<PracticeProvider["guidedTurn"]>>()
      .mockResolvedValue({
        text: "A lovely walk.",
        reply: "Where did you go?",
      });
    const app = createPracticeRoutes(
      {
        createSession: vi.fn<PracticeProvider["createSession"]>(),
        assessConversation,
        suggestReply,
        guidedTurn,
      },
      origin
    );
    return {
      generate: {
        "/feedback": assessConversation,
        "/reply-suggestions": suggestReply,
        "/guided-turns": guidedTurn,
      }[path],
      request: (body: string) =>
        app.request(path, {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body,
        }),
    };
  }

  it.each([false, true])(
    "passes 60,000 Unicode characters to the provider (escaped=%s)",
    async (escaped) => {
      const { request, generate } = setup();
      const json = JSON.stringify(transcript);
      const payload = escaped
        ? json.replaceAll(
            /[你好世界]/gu,
            (character) => `\\u${character.codePointAt(0)?.toString(16)}`
          )
        : json;
      expect(new TextEncoder().encode(payload).length).toBeGreaterThan(128_000);
      const response = await request(payload);
      expect(response.status).toBe(200);
      expect(generate).toHaveBeenCalledWith(
        transcript,
        expect.any(AbortSignal)
      );
      await expect(response.json()).resolves.toStrictEqual(result);
    }
  );

  it("rejects semantic overflow below the HTTP ceiling before generation", async () => {
    const { request, generate } = setup();
    const messages = transcript.messages.map((message, index) => ({
      ...message,
      text: message.text + (index === 0 ? "你" : ""),
    }));
    const response = await request(JSON.stringify({ ...transcript, messages }));
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects HTTP overflow before generation", async () => {
    const { request, generate } = setup();
    const response = await request(
      JSON.stringify({ ...transcript, extra: "x".repeat(512 * 1024) })
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toStrictEqual({
      error: "That request is too large.",
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
