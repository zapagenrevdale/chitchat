// Sequential requests intentionally exercise evolving quota and cookie state.
/* eslint-disable no-await-in-loop */
import { onboardingCompleteSchema } from "@chitchat/contracts/onboarding";
import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import {
  createOnboardingLiveSession,
  onboardingLiveInstruction,
} from "./onboarding-live";
import { createOnboardingLiveRoutes } from "./onboarding-live-routes";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const request = { name: "Dale", language: "English" as const };
function setup() {
  const createOnboardingSession = vi
    .fn<NonNullable<PracticeProvider["createOnboardingSession"]>>()
    .mockResolvedValue({
      token: "auth_tokens/test",
      model: "gemini-3.8-live",
      apiVersion: "v1beta",
      maxDurationMs: 180_000,
      expiresAt: Date.now() + 180_000,
    });
  const provider = {
    createSession: vi.fn<PracticeProvider["createSession"]>(),
    createOnboardingSession,
  };
  return { provider, app: createPracticeRoutes(provider, origin) };
}

describe("onboarding Live sessions", () => {
  it("locks word timestamps into the constrained token without exposing credentials", async () => {
    const create = vi
      .fn<GoogleGenAI["authTokens"]["create"]>()
      .mockResolvedValue({ name: "auth_tokens/timed" });
    const ai = { authTokens: { create } } as unknown as GoogleGenAI;
    const session = await createOnboardingLiveSession(
      ai,
      request,
      new AbortController().signal
    );
    expect(session.token).toBe("auth_tokens/timed");
    expect(create).toHaveBeenCalledWith({
      config: expect.objectContaining({
        liveConnectConstraints: expect.objectContaining({
          config: expect.objectContaining({
            outputAudioTranscription: { wordTimestamp: true },
          }),
        }),
        httpOptions: {
          extraBody: {
            fieldMask: expect.stringContaining("outputAudioTranscription"),
          },
        },
      }),
    });
  });

  it("validates identity and origin before issuing tokens", async () => {
    const { app, provider } = setup();
    for (const [body, requestOrigin, status] of [
      [{ ...request, name: "" }, origin, 400],
      [{ ...request, messages: [] }, origin, 400],
      [request, "https://other.example", 403],
    ] as const) {
      const response = await app.request("/onboarding-sessions", {
        method: "POST",
        headers: { origin: requestOrigin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(status);
    }
    expect(provider.createOnboardingSession).not.toHaveBeenCalled();
  });

  it("limits repeat provisioning with a signed cookie", async () => {
    const { app, provider } = setup();
    let cookie = "";
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await app.request("/onboarding-sessions", {
        method: "POST",
        headers: { origin, cookie, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(attempt < 3 ? 200 : 429);
      cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
      responses.push(response);
    }
    expect(responses[0]?.headers.get("set-cookie")).toContain("HttpOnly");
    expect(responses[3]?.headers.get("retry-after")).toBeTruthy();
    expect(provider.createOnboardingSession).toHaveBeenCalledTimes(3);
    expect(provider.createOnboardingSession).toHaveBeenCalledWith(
      request,
      expect.any(AbortSignal)
    );
  });

  it("bounds new anonymous visitors independently of the cookie", async () => {
    const { provider } = setup();
    const app = createOnboardingLiveRoutes(provider);
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await app.request("/onboarding-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(attempt < 20 ? 200 : 429);
    }
    expect(provider.createOnboardingSession).toHaveBeenCalledTimes(20);
  });

  it("rejects malformed completion data", () => {
    expect(
      onboardingCompleteSchema.safeParse({
        status: "ready",
        goal: "",
        suggestedSkills: [],
      }).success
    ).toBeFalsy();
    expect(
      onboardingCompleteSchema.safeParse({
        status: "choose",
        goal: "invented",
        suggestedSkills: [],
      }).success
    ).toBeFalsy();
  });

  it("starts fresh and waits for tool acceptance before the final acknowledgment", () => {
    const instruction = onboardingLiveInstruction({
      name: "Dale",
      language: "English",
    });
    expect(instruction).toContain("Begin this fresh conversation");
    expect(instruction).toContain("FIRST call complete_onboarding");
    expect(instruction).toContain("Only after accepted is true");
    expect(instruction).not.toContain("prior conversation");
  });
});
