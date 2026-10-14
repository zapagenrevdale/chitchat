import { practiceLanguages } from "@chitchat/contracts";
import {
  onboardingBenefitIds,
  onboardingTurnSchema,
} from "@chitchat/contracts/onboarding";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOnboardingProvider } from "./onboarding";
import {
  textClient,
  textError,
  textResponse,
  textStreamResponse,
} from "./text-model.test-helper";

function filteredResponse(partialReply?: string) {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        if (partialReply) {
          controller.enqueue({ type: "text-start", id: "reply" });
          controller.enqueue({
            type: "text-delta",
            id: "reply",
            delta: JSON.stringify({ reply: partialReply }),
          });
          controller.enqueue({ type: "text-end", id: "reply" });
        }
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "content-filter", raw: "SAFETY" },
          usage: {
            inputTokens: {
              total: 490,
              noCache: 490,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
        });
        controller.close();
      },
    }),
  } satisfies Awaited<ReturnType<ReturnType<typeof textClient>["stream"]>>;
}

describe("onboarding content filtering", () => {
  it("lets the learner choose skills when the provider filters the reply", async () => {
    const { ai, stream } = textClient();
    stream.mockResolvedValue(filteredResponse());
    const result = await createOnboardingProvider(ai).onboardingTurn(
      {
        name: "baba",
        language: "English",
        messages: [
          { role: "user", text: "i want to approach girls and get laid" },
        ],
      },
      new AbortController().signal
    );
    expect(result).toStrictEqual({
      status: "choose",
      reply:
        "Chit couldn't respond to that message. You can choose the conversation skills you'd like to practice.",
      goal: "",
      suggestedSkills: [],
    });
    expect(stream).toHaveBeenCalledOnce();
  });

  it.each(practiceLanguages)(
    "returns valid recovery in %s",
    async (language) => {
      const { ai, stream } = textClient();
      stream.mockResolvedValue(filteredResponse());
      const result = await createOnboardingProvider(ai).onboardingTurn(
        {
          name: "Alex",
          language,
          messages: [{ role: "user", text: "A goal" }],
        },
        new AbortController().signal
      );
      expect(onboardingTurnSchema.safeParse(result).success).toBeTruthy();
      expect(result.status).toBe("choose");
      expect(result.reply.includes("Chit couldn't respond")).toBe(
        language === "English"
      );
    }
  );

  it("replaces a filtered partial reply with the recovery message", async () => {
    const { ai, stream } = textClient();
    stream.mockResolvedValue(filteredResponse("An unfinished reply"));
    const partial = vi.fn<(reply: string) => void>();
    const result = await createOnboardingProvider(ai).onboardingTurn(
      {
        name: "Alex",
        language: "English",
        messages: [{ role: "user", text: "A goal" }],
      },
      new AbortController().signal,
      partial
    );
    expect(partial).toHaveBeenCalledWith("An unfinished reply");
    expect(partial).toHaveBeenLastCalledWith(result.reply);
    expect(result.status).toBe("choose");
  });

  it("does not turn an aborted filtered reply into a completed turn", async () => {
    const { ai, stream } = textClient();
    const controller = new AbortController();
    stream.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(filteredResponse());
    });
    await expect(
      createOnboardingProvider(ai).onboardingTurn(
        {
          name: "Alex",
          language: "English",
          messages: [{ role: "user", text: "A goal" }],
        },
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each(["malformed", "provider"])(
    "keeps %s failures as errors",
    async (failure) => {
      const { ai, stream } = textClient();
      if (failure === "provider") {
        stream.mockRejectedValue(textError(503));
      } else {
        stream.mockResolvedValue(textStreamResponse({ reply: "Incomplete" }));
      }
      await expect(
        createOnboardingProvider(ai).onboardingTurn(
          {
            name: "Alex",
            language: "English",
            messages: [{ role: "user", text: "A goal" }],
          },
          new AbortController().signal
        )
      ).rejects.toThrow(
        /No object generated|No output generated|provider detail/u
      );
    }
  );
});

describe("localized onboarding recommendations", () => {
  it("asks for the validated practice language while preserving skill IDs", async () => {
    const { ai, generate } = textClient();
    generate.mockResolvedValue(
      textResponse({
        acknowledgment: "一緒に会話を練習しましょう。",
        suggestedSkills: ["listening"],
      })
    );
    const result = await createOnboardingProvider(ai).recommendOnboarding(
      {
        name: "Alex",
        language: "Japanese",
        motivation: "友達と話したいです。",
      },
      new AbortController().signal
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("sentence in Japanese"),
          }),
        ]),
      })
    );
    expect(result.suggestedSkills).toStrictEqual([]);
  });
});

describe("personalized onboarding benefits", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("attaches Jev results to ready turns using the full conversation", async () => {
    const { ai, stream } = textClient();
    stream.mockResolvedValue(
      textStreamResponse({
        status: "ready",
        reply: "Let's practice work conversations.",
        goal: "Speak at work",
        suggestedSkills: ["clear-expression"],
      })
    );
    const conversation = [
      { role: "user" as const, text: "I struggle talking" },
      { role: "assistant" as const, text: "In what situations?" },
      { role: "user" as const, text: "At work with colleagues" },
    ];
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        answers: Object.fromEntries(
          onboardingBenefitIds.map((id, index) => [
            id,
            { type: "score", score: (index / onboardingBenefitIds.length) * 3 },
          ])
        ),
      })
    );
    vi.stubGlobal("fetch", request);
    const result = await createOnboardingProvider(
      ai,
      "test-key"
    ).onboardingTurn(
      { name: "Alex", language: "English", messages: conversation },
      new AbortController().signal
    );
    expect(result.benefits).toStrictEqual({
      ids: ["end-conversations", "respond-with-care", "everyday-tasks"],
      personalized: true,
    });
    expect(
      JSON.parse(String(request.mock.calls[0]?.[1]?.body)).state.conversation
    ).toStrictEqual(conversation);
    expect(
      JSON.stringify(stream.mock.calls[0]?.[0].responseFormat)
    ).not.toContain('"benefits"');
  });

  it("shows partial replies while benefits are pending but resolves only after benefits", async () => {
    const { ai, stream } = textClient();
    stream.mockResolvedValue(
      textStreamResponse({
        status: "ready",
        reply: "Let's practice talking at work.",
        goal: "Speak at work",
        suggestedSkills: ["clear-expression"],
      })
    );
    const pending = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async () => {
        const response = await pending.promise;
        return response.clone();
      })
    );
    const partial = vi.fn<(reply: string) => void>();
    const finished = vi.fn<() => void>();
    const result = createOnboardingProvider(ai, "test-key")
      .onboardingTurn(
        {
          name: "Alex",
          language: "English",
          messages: [{ role: "user", text: "Work conversations" }],
        },
        new AbortController().signal,
        partial
      )
      .then((turn) => {
        finished();
        return turn;
      });
    await vi.waitFor(() =>
      expect(partial).toHaveBeenCalledWith("Let's practice talking at work.")
    );
    expect(finished).not.toHaveBeenCalled();
    pending.resolve(
      Response.json({
        answers: Object.fromEntries(
          onboardingBenefitIds.map((id) => [id, { type: "score", score: 1 }])
        ),
      })
    );
    const turn = await result;
    expect(turn.benefits?.personalized).toBeTruthy();
  });

  it.each(["clarify", "choose"] as const)(
    "does not rank benefits for %s turns",
    async (status) => {
      const { ai, stream } = textClient();
      stream.mockResolvedValue(
        textStreamResponse({
          status,
          reply: "Let's explore.",
          goal: "",
          suggestedSkills: [],
        })
      );
      const request = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", request);
      const result = await createOnboardingProvider(
        ai,
        "test-key"
      ).onboardingTurn(
        {
          name: "Alex",
          language: "English",
          messages: [{ role: "user", text: "idk" }],
        },
        new AbortController().signal
      );
      expect(result.benefits).toBeUndefined();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("uses saved goal and conversation when restoring recommendations", async () => {
    const { ai, generate } = textClient();
    generate.mockResolvedValue(
      textResponse({
        acknowledgment: "Let's practice.",
        suggestedSkills: ["listening"],
      })
    );
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        answers: Object.fromEntries(
          onboardingBenefitIds.map((id) => [id, { type: "score", score: 1 }])
        ),
      })
    );
    vi.stubGlobal("fetch", request);
    const conversation = [
      { role: "user" as const, text: "Talk with colleagues" },
    ];
    const result = await createOnboardingProvider(
      ai,
      "test-key"
    ).recommendOnboarding(
      {
        name: "Alex",
        language: "English",
        motivation: "Speak at work",
        conversation,
      },
      new AbortController().signal
    );
    expect(result.benefits?.personalized).toBeTruthy();
    expect(
      JSON.parse(String(request.mock.calls[0]?.[1]?.body)).state
    ).toStrictEqual({
      language: "English",
      goal: "Speak at work",
      conversation,
    });
    expect(
      JSON.stringify(generate.mock.calls[0]?.[0].responseFormat)
    ).not.toContain('"benefits"');
  });
});
