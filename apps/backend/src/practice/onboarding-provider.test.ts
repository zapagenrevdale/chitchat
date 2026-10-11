import { onboardingBenefitIds } from "@chitchat/contracts/onboarding";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOnboardingProvider } from "./onboarding";
import {
  textClient,
  textResponse,
  textStreamResponse,
} from "./text-model.test-helper";

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
    expect(result.suggestedSkills).toStrictEqual(["listening"]);
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
            { type: "score", score: index / 4 },
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
      ids: ["useful-feedback", "everyday-language", "playful-conversations"],
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
    let complete!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(
        () =>
          // oxlint-disable-next-line promise/avoid-new -- Hold benefit ranking behind the partial reply.
          new Promise((resolve) => {
            complete = resolve;
          })
      )
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
    complete(
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
