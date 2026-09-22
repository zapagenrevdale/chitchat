import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import { buildSystemInstruction } from "./catalog";
import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const body = {
  place: {
    name: "Baseball field",
    description: "A local field before practice.",
  },
  situation: {
    name: "Meet the team",
    description: "Meeting other players on the field.",
  },
  personaId: "ryan",
  backstory: "I just joined the team and Ryan is the captain.",
};
const preview = {
  title: "Your first day on the team.",
  description: "Ryan is warming up on the field as you arrive for practice.",
  goal: "Learn one thing about your new team.",
};
function setup() {
  const generateScenePreview = vi
    .fn<NonNullable<PracticeProvider["generateScenePreview"]>>()
    .mockResolvedValue(preview);
  const createSession = vi
    .fn<PracticeProvider["createSession"]>()
    .mockResolvedValue({
      token: "auth_tokens/test",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: 123,
    });
  const app = createPracticeRoutes(
    { generateScenePreview, createSession },
    origin
  );
  const request = (data: unknown = body, from = origin) =>
    app.request("/scene-previews", {
      method: "POST",
      headers: { origin: from, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  return { app, request, generateScenePreview, createSession };
}

describe("AI scene previews", () => {
  it("passes custom scene details and backstory to the provider", async () => {
    const { request, generateScenePreview } = setup();
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual(preview);
    expect(generateScenePreview).toHaveBeenCalledWith(
      body,
      expect.any(AbortSignal)
    );
  });

  it.each([
    { ...body, personaId: "invented" },
    { ...body, situation: undefined },
    { ...body, backstory: "x".repeat(1001) },
  ])("validates scene requests before calling AI", async (invalid) => {
    const { request, generateScenePreview } = setup();
    await expect(request(invalid)).resolves.toMatchObject({ status: 400 });
    expect(generateScenePreview).not.toHaveBeenCalled();
  });

  it("rejects foreign origins and unavailable generation", async () => {
    const { request, generateScenePreview } = setup();
    await expect(
      request(body, "https://elsewhere.example")
    ).resolves.toMatchObject({ status: 403 });
    expect(generateScenePreview).not.toHaveBeenCalled();
    await expect(
      createPracticeRoutes(undefined, origin).request("/scene-previews", {
        method: "POST",
        headers: { origin },
        body: JSON.stringify(body),
      })
    ).resolves.toMatchObject({ status: 503 });
  });

  it("rejects invalid generated copy and hides provider errors", async () => {
    const { request, generateScenePreview } = setup();
    generateScenePreview.mockResolvedValueOnce({ ...preview, goal: "" });
    await expect(request()).resolves.toMatchObject({ status: 502 });
    generateScenePreview.mockRejectedValueOnce(
      new Error("secret-provider-detail")
    );
    const response = await request();
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain(
      "secret-provider-detail"
    );
  });

  it("reports exhausted rate limits without leaking provider details", async () => {
    const { request, generateScenePreview } = setup();
    generateScenePreview.mockRejectedValueOnce(
      new ApiError({ status: 429, message: "secret-provider-detail" })
    );
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    await expect(response.json()).resolves.toStrictEqual({
      error: "Chit has reached its request limit. Please try again later.",
    });
  });

  it.each([true, false])(
    "carries the reviewed scene into live practice with goal enabled = %s",
    async (includeGoal) => {
      const { app, createSession } = setup();
      const selection = {
        placeId: "custom",
        customPlace: body.place.name,
        settingId: "custom",
        customSetting: body.situation.name,
        personaId: body.personaId,
        backstory: body.backstory,
        scenePreview: {
          title: preview.title,
          description: preview.description,
        },
        ...(includeGoal && { goal: preview.goal }),
      };
      const response = await app.request("/sessions", {
        method: "POST",
        headers: { origin },
        body: JSON.stringify(selection),
      });
      expect(response.status).toBe(201);
      expect(createSession).toHaveBeenCalledWith(
        selection,
        expect.any(AbortSignal)
      );
      const instruction = buildSystemInstruction(selection);
      expect(instruction).toContain(JSON.stringify(body.backstory));
      expect(instruction).toContain(JSON.stringify(selection.scenePreview));
      expect(instruction.includes(JSON.stringify(preview.goal))).toBe(
        includeGoal
      );
    }
  );
});
