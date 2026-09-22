import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGeminiProvider } from "./gemini";

const request = {
  place: { name: "Cafe", description: "A neighborhood cafe." },
  situation: {
    name: "Reconnecting",
    description: "Meeting a former teammate.",
  },
  personaId: "maya",
  backstory: "We used to play on the same baseball team.",
};
const preview = {
  title: "Catching up with Maya",
  description: "Maya waves from a window seat as you enter the cafe.",
  goal: "Ask what Maya has been doing since you last met.",
};

function failure(status: number) {
  return Response.json(
    { error: { code: status, message: "Temporary provider failure" } },
    { status }
  );
}

describe("scene preview provider retries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recovers from rate limits and temporary outages using the real SDK", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(
        Response.json({
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify(preview) }] },
              finishReason: "STOP",
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetch);
    const result = createGeminiProvider("test-key").generateScenePreview?.(
      request,
      new AbortController().signal
    );
    await Promise.all([
      expect(result).resolves.toStrictEqual(preview),
      vi.runAllTimersAsync(),
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops after four attempts when the rate limit persists", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(failure(429));
    vi.stubGlobal("fetch", fetch);
    const result = createGeminiProvider("test-key").generateScenePreview?.(
      request,
      new AbortController().signal
    );
    await Promise.all([
      expect(result).rejects.toMatchObject({ status: 429 }),
      vi.runAllTimersAsync(),
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not retry an invalid request", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(failure(400));
    vi.stubGlobal("fetch", fetch);
    await expect(
      createGeminiProvider("test-key").generateScenePreview?.(
        request,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
