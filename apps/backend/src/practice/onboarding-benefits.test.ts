import {
  defaultOnboardingBenefits,
  onboardingBenefitIds,
} from "@chitchat/contracts/onboarding";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectOnboardingBenefits } from "./onboarding-benefits";

const state = {
  language: "English",
  goal: "Explain my ideas at work",
  conversation: [
    { role: "user" as const, text: "I want to explain my ideas at work." },
  ],
};
const fallback = { ids: defaultOnboardingBenefits, personalized: false };
function answers() {
  return Object.fromEntries(
    onboardingBenefitIds.map((id) => [id, { type: "score", score: 0.1 }])
  );
}
function mockResponse(body: unknown, status = 200) {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", request);
  return request;
}

describe("Jev onboarding benefits", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("batches every candidate over the conversation and selects the highest three with stable ties", async () => {
    const scores = answers();
    scores["work-conversations"] = { type: "score", score: 3 };
    scores["express-yourself"] = { type: "score", score: 2.8 };
    scores["think-on-your-feet"] = { type: "score", score: 2.8 };
    const request = mockResponse({ answers: scores });
    const result = await selectOnboardingBenefits(
      "test-key",
      state,
      new AbortController().signal
    );
    expect(result).toStrictEqual({
      ids: ["work-conversations", "think-on-your-feet", "express-yourself"],
      personalized: true,
    });
    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.headers).toStrictEqual(
      expect.objectContaining({ Authorization: "Bearer test-key" })
    );
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ state, model: "jev-latest" });
    expect(Object.keys(body.questions)).toStrictEqual([
      ...onboardingBenefitIds,
    ]);
  });

  it.each([
    {},
    { answers: {} },
    {
      answers: {
        ...answers(),
        "work-conversations": { type: "score", score: 4 },
      },
    },
    {
      answers: {
        ...answers(),
        "work-conversations": { type: "score", score: "3" },
      },
    },
    {
      answers: {
        ...answers(),
        "work-conversations": { type: "noul", score: 1 },
      },
    },
  ])("falls back on malformed or missing judgments", async (body) => {
    mockResponse(body);
    await expect(
      selectOnboardingBenefits("test-key", state, new AbortController().signal)
    ).resolves.toStrictEqual(fallback);
  });

  it("does not call an entirely unrelated selection personalized", async () => {
    mockResponse({
      answers: Object.fromEntries(
        onboardingBenefitIds.map((id) => [id, { type: "score", score: 0 }])
      ),
    });
    await expect(
      selectOnboardingBenefits("test-key", state, new AbortController().signal)
    ).resolves.toStrictEqual(fallback);
  });

  it("does not request Jev without a key", async () => {
    const request = mockResponse({});
    await expect(
      selectOnboardingBenefits(undefined, state, new AbortController().signal)
    ).resolves.toStrictEqual(fallback);
    expect(request).not.toHaveBeenCalled();
  });

  it("falls back on service and transport errors", async () => {
    const request = mockResponse({}, 503);
    await expect(
      selectOnboardingBenefits("test-key", state, new AbortController().signal)
    ).resolves.toStrictEqual(fallback);
    request.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(
      selectOnboardingBenefits("test-key", state, new AbortController().signal)
    ).resolves.toStrictEqual(fallback);
  });

  it("bounds a stalled request to eight seconds", async () => {
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(
        AbortSignal.abort(new DOMException("Timed out", "TimeoutError"))
      );
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        init.signal.throwIfAborted();
      })
    );
    try {
      await expect(
        selectOnboardingBenefits(
          "test-key",
          state,
          new AbortController().signal
        )
      ).resolves.toStrictEqual(fallback);
      expect(timeout).toHaveBeenCalledWith(8000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("propagates caller cancellation instead of returning fallback", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        controller.abort(new Error("Caller cancelled"));
        return Promise.reject(controller.signal.reason);
      })
    );
    await expect(
      selectOnboardingBenefits("test-key", state, controller.signal)
    ).rejects.toThrow("Caller cancelled");
  });
});
