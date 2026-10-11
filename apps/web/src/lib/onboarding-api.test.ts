import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeOnboardingVoice,
  createOnboardingSession,
} from "./practice-api";

describe("onboarding voice API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the constrained onboarding contract and includes the anonymous quota cookie", async () => {
    const session = {
      token: "auth_tokens/onboarding",
      model: "gemini-3.8-live",
      apiVersion: "v1beta",
      expiresAt: Date.now() + 180_000,
      maxDurationMs: 180_000,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(session));
    vi.stubGlobal("fetch", fetchMock);
    const { signal } = new AbortController();
    const request = { name: "Dale", language: "English" as const };

    await expect(
      createOnboardingSession(request, signal)
    ).resolves.toStrictEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/onboarding-sessions"),
      expect.objectContaining({
        credentials: "include",
        signal,
        body: JSON.stringify(request),
      })
    );
  });

  it("rejects the old practice session contract instead of connecting with mismatched settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          token: "auth_tokens/old",
          model: "gemini-3.1-flash-live-preview",
          expiresAt: Date.now() + 180_000,
        })
      )
    );
    await expect(
      createOnboardingSession(
        { name: "Dale", language: "English" },
        new AbortController().signal
      )
    ).rejects.toThrow(/gemini-3.8-live/u);
  });

  it("finalizes only the current voice evidence and allows explicit skill choice", async () => {
    const outcome = {
      status: "choose" as const,
      goal: "",
      suggestedSkills: [],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(outcome));
    vi.stubGlobal("fetch", fetchMock);
    const { signal } = new AbortController();
    const body = {
      name: "Dale",
      language: "English" as const,
      outcome,
      messages: [],
    };

    await expect(completeOnboardingVoice(body, signal)).resolves.toStrictEqual(
      outcome
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/onboarding-completions"),
      expect.objectContaining({ signal, body: JSON.stringify(body) })
    );
  });
});
