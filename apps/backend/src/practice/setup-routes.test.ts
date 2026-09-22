import { describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
function setup() {
  const provider = {
    createSession: vi.fn<PracticeProvider["createSession"]>(),
    interpretSetup: vi
      .fn<NonNullable<PracticeProvider["interpretSetup"]>>()
      .mockResolvedValue({
        place: "cafe",
        setting: "ordering",
        difficulty: "easy",
        personaId: null,
        random: "none",
      }),
  };
  const app = createPracticeRoutes(provider, origin);
  const request = (body: unknown, from = origin) =>
    app.request("/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: from },
      body: JSON.stringify(body),
    });
  return { provider, app, request };
}
const body = {
  selection: {},
  step: "place",
  action: "answer",
  text: "Order coffee at a café with easy questions",
};

describe("guided setup endpoint", () => {
  it("extracts multiple choices without creating a voice session", async () => {
    const { request, provider } = setup();
    const response = await request(body);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual({
      selection: { placeId: "cafe", settingId: "ordering", difficulty: "easy" },
    });
    expect(provider.createSession).not.toHaveBeenCalled();
  });

  it.each([
    "random",
    "anywhere",
    "Pick for me!",
    "Surprise me with everything",
  ])("recognizes %s without a model call", async (text) => {
    const { request, provider } = setup();
    await expect(request({ ...body, text })).resolves.toMatchObject({
      status: 200,
    });
    expect(provider.interpretSetup).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, text: " " },
    { ...body, text: "x".repeat(501) },
    { ...body, selection: { placeId: "custom" } },
    { ...body, selection: { personaId: "invented" } },
    { ...body, step: "unknown" },
  ])("validates incoming setup data", async (invalid) => {
    const { request, provider } = setup();
    await expect(request(invalid)).resolves.toMatchObject({ status: 400 });
    expect(provider.interpretSetup).not.toHaveBeenCalled();
  });

  it("checks the request origin", async () => {
    const { request, provider } = setup();
    await expect(
      request(body, "https://elsewhere.example")
    ).resolves.toMatchObject({ status: 403 });
    expect(provider.interpretSetup).not.toHaveBeenCalled();
  });

  it("keeps random setup available without Gemini", async () => {
    const app = createPracticeRoutes(undefined, origin);
    const response = await app.request("/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({
        selection: {},
        step: "place",
        action: "random-all",
      }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      selection: { difficulty: "balanced" },
    });
  });

  it("does not invent a choice for unrelated answers", async () => {
    const { request, provider } = setup();
    provider.interpretSetup.mockResolvedValue({
      place: null,
      setting: null,
      difficulty: null,
      personaId: null,
      random: "none",
    });
    await expect(request(body)).resolves.toMatchObject({ status: 422 });
  });

  it("validates model output and sanitizes provider errors", async () => {
    const { request, provider } = setup();
    provider.interpretSetup.mockResolvedValueOnce({
      place: null,
      setting: null,
      difficulty: null,
      personaId: "invented",
      random: "none",
    });
    await expect(request(body)).resolves.toMatchObject({ status: 502 });
    provider.interpretSetup.mockRejectedValueOnce(
      new Error("private-key-details")
    );
    const response = await request(body);
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain("private-key-details");
    await expect(request(body)).resolves.toMatchObject({ status: 200 });
  });

  it("accepts custom scenes in live session provisioning", async () => {
    const { app, provider } = setup();
    const selection = {
      personaId: "maya",
      placeId: "custom",
      customPlace: "Hotel reception in Tokyo",
      settingId: "custom",
      customSetting: "Ask for a room",
      difficulty: "easy",
    };
    provider.createSession.mockResolvedValue({
      token: "auth_tokens/test",
      model: "gemini-3.1-flash-live-preview",
      expiresAt: 123,
    });
    const response = await app.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify(selection),
    });
    expect(response.status).toBe(201);
    expect(provider.createSession).toHaveBeenCalledWith(
      selection,
      expect.any(AbortSignal)
    );
  });
});
