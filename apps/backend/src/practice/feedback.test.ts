import type {
  PracticeAssessment,
  PracticeFeedbackRequest,
} from "@chitchat/contracts";
import { describe, expect, it, vi } from "vitest";

import { finalizeFeedback, hasEnoughConversation } from "./feedback";
import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const conversation = {
  selection: { personaId: "theo", placeId: "cafe", settingId: "casual" },
  messages: [
    { id: 1, speaker: "partner", text: "I come here after my morning run." },
    { id: 2, speaker: "user", text: "Where do you like to run around here?" },
    { id: 3, speaker: "partner", text: "The park, mostly. It's peaceful." },
    {
      id: 4,
      speaker: "user",
      text: "That sounds lovely. I walk there on weekends too.",
    },
    { id: 5, speaker: "partner", text: "The lake is my favorite bit." },
    {
      id: 6,
      speaker: "user",
      text: "I love that part! Have you seen the new path by the lake?",
    },
  ],
} satisfies Pick<PracticeFeedbackRequest, "selection" | "messages">;
const assessment: PracticeAssessment = {
  summary: "You found common ground and kept the conversation moving.",
  curiosity: {
    score: 4,
    note: "Your question about the lake built on Theo's favorite spot.",
  },
  listening: { score: 5, note: "You picked up the running and lake details." },
  sharing: {
    score: 3,
    note: "You shared your weekend walks, with room for one more detail.",
  },
  highlight: {
    messageId: 4,
    quote: "I walk there on weekends too.",
    note: "A small personal detail gave you common ground.",
  },
  nextStep: {
    tip: "Add one specific detail about your own walks.",
  },
};

const body: PracticeFeedbackRequest = conversation;
function setup() {
  const createSession = vi.fn<PracticeProvider["createSession"]>();
  const assessConversation = vi
    .fn<NonNullable<PracticeProvider["assessConversation"]>>()
    .mockResolvedValue(finalizeFeedback(assessment, body.messages));
  const speakFeedback = vi
    .fn<NonNullable<PracticeProvider["speakFeedback"]>>()
    .mockResolvedValue({
      text: "Your feedback.",
      audio: "AAE=",
      mimeType: "audio/pcm;rate=24000",
    });
  const app = createPracticeRoutes(
    { createSession, assessConversation, speakFeedback },
    origin
  );
  const request = (data: unknown = body, from = origin) =>
    app.request("/feedback", {
      method: "POST",
      headers: { origin: from, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  const speechBody = {
    selection: body.selection,
    feedback: finalizeFeedback(assessment, body.messages),
  };
  const requestSpeech = (data: unknown = speechBody, from = origin) =>
    app.request("/feedback-speech", {
      method: "POST",
      headers: { origin: from, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  return {
    request,
    createSession,
    assessConversation,
    speakFeedback,
    requestSpeech,
  };
}

describe("conversation feedback", () => {
  it("requests a backend assessment using the transcript without a caller-supplied score", async () => {
    const { request, createSession, assessConversation } = setup();
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual({
      ...assessment,
      status: "scored",
      score: 8,
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(assessConversation).toHaveBeenCalledWith(
      body,
      expect.any(AbortSignal)
    );
  });

  it.each(
    [
      [],
      body.messages.slice(0, 2),
      body.messages.filter(({ speaker }) => speaker === "partner"),
      body.messages.map((message) => ({
        ...message,
        text: message.speaker === "user" ? "yes" : message.text,
      })),
      body.messages.map((message) => ({
        ...message,
        text:
          message.speaker === "user" ? "! ? 。 … ".repeat(10) : message.text,
      })),
      ...["はい", "你好", "สวัสดี"].map((text) =>
        body.messages.map((message) => ({ ...message, text }))
      ),
      [
        ...body.messages.filter(({ speaker }) => speaker === "user"),
        ...body.messages.filter(({ speaker }) => speaker === "partner"),
      ],
    ].map((messages) => ({ messages }))
  )(
    "does not invent a score for too little conversation",
    async ({ messages }) => {
      const { request, assessConversation } = setup();
      const response = await request({ ...body, messages });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual({
        status: "insufficient",
      });
      expect(assessConversation).not.toHaveBeenCalled();
    }
  );

  it("counts adjacent transcription chunks as a single turn", () => {
    const messages = [
      ...body.messages.filter(({ speaker }) => speaker === "user"),
      ...body.messages.filter(({ speaker }) => speaker === "partner"),
    ];
    expect(hasEnoughConversation(messages)).toBeFalsy();
    expect(hasEnoughConversation(body.messages)).toBeTruthy();
  });

  it("accepts a full transcript beyond the small setup request limit", async () => {
    const { request, assessConversation } = setup();
    const messages = [
      ...body.messages,
      { id: 7, speaker: "partner", text: "More conversation. ".repeat(350) },
    ];
    const response = await request({ ...body, messages });
    expect(response.status).toBe(200);
    expect(assessConversation).toHaveBeenCalledWith(
      { ...body, messages },
      expect.any(AbortSignal)
    );
    await expect(response.json()).resolves.toStrictEqual(
      finalizeFeedback(assessment, body.messages)
    );
  });

  it.each([
    "私は週末に公園を散歩するのが好きです。湖の近くには美しい花がたくさん咲いています。あなたは普段どこを歩きますか。",
    "我喜欢周末和朋友一起去公园散步。湖边有很多漂亮的花，我们常常在那里聊天。你平时喜欢去什么地方？",
    "ฉันชอบเดินเล่นในสวนสาธารณะกับเพื่อนในวันหยุดเราเห็นดอกไม้สวยงามริมทะเลสาบและพูดคุยกันคุณชอบไปเดินเล่นที่ไหน",
  ])("assesses substantial conversation without spaces: %s", async (text) => {
    const { request, assessConversation } = setup();
    const messages = body.messages.map((message) => ({ ...message, text }));
    const response = await request({ ...body, messages });
    expect(response.status).toBe(200);
    expect(assessConversation).toHaveBeenCalledWith(
      { ...body, messages },
      expect.any(AbortSignal)
    );
    await expect(response.json()).resolves.toStrictEqual(
      finalizeFeedback(assessment, body.messages)
    );
  });

  it.each([
    { ...body, selection: { ...body.selection, personaId: "unknown" } },
    { ...body, messages: [{ ...body.messages[0], speaker: "system" }] },
    { ...body, messages: [body.messages[0], body.messages[0]] },
    { ...body, messages: [{ id: 1, speaker: "user", text: "x".repeat(8001) }] },
    {
      ...body,
      messages: Array.from({ length: 9 }, (_, id) => ({
        id,
        speaker: "user",
        text: "x".repeat(7000),
      })),
    },
  ])(
    "validates transcript limits, speakers, IDs, and scene",
    async (invalid) => {
      const { request, assessConversation } = setup();
      await expect(request(invalid)).resolves.toMatchObject({ status: 400 });
      expect(assessConversation).not.toHaveBeenCalled();
    }
  );

  it("rejects foreign origins and oversized request bodies", async () => {
    const { request, assessConversation } = setup();
    await expect(
      request(body, "https://elsewhere.example")
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      request({ ...body, extra: "x".repeat(512 * 1024) })
    ).resolves.toMatchObject({ status: 413 });
    expect(assessConversation).not.toHaveBeenCalled();
  });

  it.each([
    { ...assessment, curiosity: { ...assessment.curiosity, score: 6 } },
    {
      ...assessment,
      highlight: {
        ...assessment.highlight,
        messageId: 1,
        quote: body.messages[0].text,
      },
    },
    {
      ...assessment,
      highlight: {
        ...assessment.highlight,
        quote: "A quote that never happened.",
      },
    },
  ])(
    "rejects invalid scores and invented or misattributed evidence",
    (invalid) => {
      expect(() =>
        finalizeFeedback(invalid as PracticeAssessment, body.messages)
      ).toThrow(/score|highlight/u);
    }
  );

  it("allows honest feedback without a positive highlight and preserves score endpoints", () => {
    const zero = {
      score: 0,
      note: "The conversation did not develop this skill.",
    };
    expect(
      finalizeFeedback(
        {
          ...assessment,
          curiosity: zero,
          listening: zero,
          sharing: zero,
          highlight: null,
        },
        body.messages
      )
    ).toMatchObject({ score: 0, highlight: null });
    const full = { score: 5, note: "Strong evidence throughout." };
    expect(
      finalizeFeedback(
        { ...assessment, curiosity: full, listening: full, sharing: full },
        body.messages
      )
    ).toMatchObject({ score: 10 });
  });

  it("keeps the backend scorer's insufficient-evidence decision even for a long transcript", async () => {
    const { request, assessConversation } = setup();
    assessConversation.mockResolvedValueOnce({ status: "insufficient" });
    const response = await request();
    await expect(response.json()).resolves.toStrictEqual({
      status: "insufficient",
    });
  });

  it("returns unavailable when the text scorer is not configured", async () => {
    const response = await createPracticeRoutes(undefined, origin).request(
      "/feedback",
      {
        method: "POST",
        headers: { origin },
        body: JSON.stringify(body),
      }
    );
    expect(response.status).toBe(503);
  });

  it("ignores caller-supplied assessments and overall scores", async () => {
    const { request } = setup();
    const response = await request({
      ...body,
      assessment: { ...assessment, score: 10 },
    });
    await expect(response.json()).resolves.toMatchObject({ score: 8 });
  });

  it("returns speech through an independent validated endpoint", async () => {
    const { requestSpeech, speakFeedback, assessConversation } = setup();
    const response = await requestSpeech();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      audio: "AAE=",
      mimeType: "audio/pcm;rate=24000",
    });
    expect(speakFeedback).toHaveBeenCalledOnce();
    expect(assessConversation).not.toHaveBeenCalled();
  });

  it("rejects invalid recap input and foreign origins before TTS", async () => {
    const { requestSpeech, speakFeedback } = setup();
    await expect(
      requestSpeech({
        selection: body.selection,
        feedback: { status: "scored", score: 10 },
      })
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      requestSpeech({}, "https://elsewhere.example")
    ).resolves.toMatchObject({ status: 403 });
    expect(speakFeedback).not.toHaveBeenCalled();
  });

  it("sanitizes independent scoring and TTS failures", async () => {
    const { request, requestSpeech, assessConversation, speakFeedback } =
      setup();
    assessConversation.mockRejectedValueOnce(new Error("secret-provider-url"));
    speakFeedback.mockRejectedValueOnce(new Error("secret-provider-url"));
    const scoreResponse = await request();
    const speechResponse = await requestSpeech();
    expect([scoreResponse.status, speechResponse.status]).toStrictEqual([
      502, 502,
    ]);
    await expect(scoreResponse.text()).resolves.not.toContain(
      "secret-provider-url"
    );
    await expect(speechResponse.text()).resolves.toContain(
      "written feedback is ready"
    );
  });
});
