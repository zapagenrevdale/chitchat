import { conversationSkillIds } from "@chitchat/contracts/conversation-goals";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectOnboardingSkills } from "./onboarding-skills";

const state = {
  language: "English",
  goal: "Share my interests",
  conversation: [
    { role: "user" as const, text: "I want to listen better." },
    {
      role: "assistant" as const,
      text: "We could also practice disagreements.",
    },
    {
      role: "user" as const,
      text: "Actually I already listen well. I want to share my own interests.",
    },
  ],
};
function answers(
  scores: Partial<Record<(typeof conversationSkillIds)[number], number>> = {}
) {
  return Object.fromEntries(
    conversationSkillIds.map((id) => [
      id,
      { type: "score", score: scores[id] ?? 0 },
    ])
  );
}
describe("onboarding skill suggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ranks direct interest, caps at three and breaks ties in catalog order", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        answers: answers({
          sharing: 3,
          listening: 2.5,
          wit: 2.5,
          disagreement: 2.5,
          clarification: 1.99,
        }),
      })
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await selectOnboardingSkills(
      "test",
      state,
      new AbortController().signal
    );
    expect(result).toStrictEqual(["sharing", "listening", "wit"]);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.state).toStrictEqual(state);
    expect(Object.keys(body.questions)).toStrictEqual([
      ...conversationSkillIds,
    ]);
    expect(body.questions.sharing.instructions.question).toContain(
      "latest corrections"
    );
    expect(body.questions.sharing.instructions.question).toContain(
      "not competence"
    );
  });

  it.each([
    [{ sharing: 2.2 }, ["sharing"]],
    [{ sharing: 2.2, listening: 2 }, ["sharing", "listening"]],
    [{ sharing: 1.9 }, []],
  ] as const)("allows fewer than three matches", async (scores, expected) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ answers: answers(scores) }))
    );
    await expect(
      selectOnboardingSkills("test", state, new AbortController().signal)
    ).resolves.toStrictEqual(expected);
  });

  it.each([
    { answers: { sharing: { type: "score", score: 3 } } },
    { answers: { ...answers(), sharing: { type: "score", score: 4 } } },
    { answers: { ...answers(), sharing: { type: "score", score: "3" } } },
    { answers: { ...answers(), sharing: { type: "choice", score: 3 } } },
    { unexpected: [] },
  ])("does not publish partial or malformed scores", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))
    );
    await expect(
      selectOnboardingSkills("test", state, new AbortController().signal)
    ).resolves.toStrictEqual([]);
  });

  it("does not call the service without a key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      selectOnboardingSkills(undefined, state, new AbortController().signal)
    ).resolves.toStrictEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("leaves suggestions empty for an HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 503 }))
    );
    await expect(
      selectOnboardingSkills("test", state, new AbortController().signal)
    ).resolves.toStrictEqual([]);
  });

  it("uses its own eight second deadline without aborting its parent", async () => {
    const timeout = new AbortController();
    const parent = new AbortController();
    const deadline = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeout.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(() => {
        timeout.abort(new DOMException("Timed out", "TimeoutError"));
        return Promise.reject(timeout.signal.reason);
      })
    );
    await expect(
      selectOnboardingSkills("test", state, parent.signal)
    ).resolves.toStrictEqual([]);
    expect(deadline).toHaveBeenCalledWith(8000);
    expect(parent.signal.aborted).toBeFalsy();
  });

  it("propagates parent cancellation even after a response arrives", async () => {
    const parent = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(() => {
        parent.abort(new Error("Superseded"));
        return Promise.resolve(
          Response.json({ answers: answers({ sharing: 3 }) })
        );
      })
    );
    await expect(
      selectOnboardingSkills("test", state, parent.signal)
    ).rejects.toThrow("Superseded");
  });
});
