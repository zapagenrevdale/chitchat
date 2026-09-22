import type { PracticeSession } from "@chitchat/contracts";
import { practiceOptionsSchema } from "@chitchat/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const selection = {
  personaId: "maya",
  placeId: "cafe",
  settingId: "networking",
};
const session: PracticeSession = {
  token: "auth_tokens/test",
  model: "gemini-3.1-flash-live-preview",
  expiresAt: 123_456,
};
function setup() {
  const provider = {
    generatePlaceImage: vi
      .fn<NonNullable<PracticeProvider["generatePlaceImage"]>>()
      .mockResolvedValue("data:image/png;base64,YQ=="),
    createSituationSession: vi
      .fn<NonNullable<PracticeProvider["createSituationSession"]>>()
      .mockResolvedValue(session),
    createPlaceSession: vi
      .fn<NonNullable<PracticeProvider["createPlaceSession"]>>()
      .mockResolvedValue(session),
    createSession: vi
      .fn<PracticeProvider["createSession"]>()
      .mockResolvedValue(session),
  };
  const app = createPracticeRoutes(provider, origin);
  const start = (body: unknown = selection, from = origin) =>
    app.request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: from },
      body: JSON.stringify(body),
    });
  return { app, provider, start };
}

describe("live practice routes", () => {
  afterEach(() => vi.useRealTimers());

  it("generates an image for a confirmed scene without exposing provider details", async () => {
    const { app, provider } = setup();
    const scene = {
      name: "Cafe",
      description: "A quiet cafe.",
      scene: {
        situation: { name: "A chance encounter", description: "Say hello." },
        personaId: "noah",
      },
    };
    const response = await app.request("/place-images", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify(scene),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      image: "data:image/png;base64,YQ==",
    });
    expect(provider.generatePlaceImage).toHaveBeenCalledWith(
      scene,
      expect.any(AbortSignal)
    );
  });

  it.each([
    {
      situation: { name: "Hello", description: "Say hello." },
      personaId: "invented",
    },
    { situation: { name: "Hello", description: "" }, personaId: "noah" },
    { personaId: "noah" },
  ])("rejects an invalid image scene before generation", async (scene) => {
    const { app, provider } = setup();
    const response = await app.request("/place-images", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({
        name: "Cafe",
        description: "A quiet cafe.",
        scene,
      }),
    });
    expect(response.status).toBe(400);
    expect(provider.generatePlaceImage).not.toHaveBeenCalled();
  });

  it("exposes all 30 voices and their tags without character instructions", async () => {
    const { app } = setup();
    const response = await app.request("/options");
    const body = await response.json();
    const { personas } = practiceOptionsSchema.parse(body);
    expect(personas).toHaveLength(30);
    expect(new Set(personas.map(({ voice }) => voice)).size).toBe(30);
    expect(new Set(personas.map(({ id }) => id)).size).toBe(30);
    expect(personas.find(({ id }) => id === "theo")).toMatchObject({
      voice: "Sadaltager",
      tags: [
        "Professional",
        "Inquisitive",
        "Articulate",
        "Approachable",
        "Calm",
      ],
    });
    expect(JSON.stringify(body)).not.toContain('"character"');
  });

  it("makes every persona available in exactly one group", async () => {
    const { app } = setup();
    const response = await app.request("/options");
    const { personas, personaGroups } = practiceOptionsSchema.parse(
      await response.json()
    );
    const groupedIds = personaGroups.flatMap(({ personaIds }) => personaIds);
    expect(new Set(groupedIds).size).toBe(groupedIds.length);
    expect(new Set(groupedIds)).toStrictEqual(
      new Set(personas.map(({ id }) => id))
    );
  });

  it.each([
    { body: selection, from: "https://elsewhere.example", status: 403 },
    {
      body: { ...selection, personaId: "invented" },
      from: origin,
      status: 400,
    },
    { body: {}, from: origin, status: 400 },
    {
      body: { ...selection, extra: "x".repeat(5000) },
      from: origin,
      status: 413,
    },
  ])("rejects invalid start with $status", async ({ body, from, status }) => {
    const { provider, start } = setup();
    await expect(start(body, from)).resolves.toMatchObject({ status });
    expect(provider.createSession).not.toHaveBeenCalled();
  });

  it("returns a private, noncached token after validating choices", async () => {
    const { app, provider, start } = setup();
    await expect(app.request("/options")).resolves.toMatchObject({
      status: 200,
    });
    const response = await start();
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual(session);
    expect(provider.createSession).toHaveBeenCalledWith(
      selection,
      expect.any(AbortSignal)
    );
  });

  it("reports missing configuration", async () => {
    const app = createPracticeRoutes(undefined, origin);
    const options = await app.request("/options");
    await expect(options.json()).resolves.toMatchObject({ available: false });
    await expect(
      app.request("/sessions", { method: "POST", headers: { origin } })
    ).resolves.toMatchObject({ status: 503 });
  });

  it("sanitizes upstream failures and releases the slot", async () => {
    const { provider, start } = setup();
    provider.createSession.mockRejectedValueOnce(
      new Error("secret-key/provider-detail")
    );
    const response = await start();
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain("secret-key");
    await expect(start()).resolves.toMatchObject({ status: 201 });
  });

  it("limits concurrent provisioning and releases slots after completion", async () => {
    const { provider, start } = setup();
    const deferred = Promise.withResolvers<PracticeSession>();
    provider.createSession.mockReturnValue(deferred.promise);
    const pending = Array.from({ length: 4 }, () => start());
    await vi.waitFor(() =>
      expect(provider.createSession).toHaveBeenCalledTimes(4)
    );
    await expect(start()).resolves.toMatchObject({ status: 429 });
    deferred.resolve(session);
    await Promise.all(pending);
    await expect(start()).resolves.toMatchObject({ status: 201 });
  });

  it("rate-limits new sessions without trusting client IP headers", async () => {
    vi.useFakeTimers();
    const { start } = setup();
    for (let index = 0; index < 30; index += 1) {
      // Provision sequentially so this tests the rate limit, not the concurrency limit.
      // oxlint-disable-next-line no-await-in-loop
      await start();
    }
    const limited = await start();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    vi.advanceTimersByTime(60_000);
    await expect(start()).resolves.toMatchObject({ status: 201 });
  });

  it("provisions Chit without scene choices and rejects cross-origin requests", async () => {
    const { app, provider } = setup();
    const response = await app.request("/place-sessions", {
      method: "POST",
      headers: { origin },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual(session);
    await expect(
      app.request("/place-sessions", {
        method: "POST",
        headers: { origin: "https://elsewhere.example" },
      })
    ).resolves.toMatchObject({ status: 403 });
    expect(provider.createPlaceSession).toHaveBeenCalledOnce();
  });

  it("validates the selected place before provisioning a custom situation session", async () => {
    const { app, provider } = setup();
    const place = { name: "Restaurant", description: "A quiet restaurant." };
    const response = await app.request("/situation-sessions", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ place }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(provider.createSituationSession).toHaveBeenCalledWith(
      place,
      expect.any(AbortSignal)
    );
    await expect(
      app.request("/situation-sessions", {
        method: "POST",
        headers: { origin },
        body: "{}",
      })
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      app.request("/situation-sessions", {
        method: "POST",
        headers: { origin: "https://elsewhere.example" },
        body: JSON.stringify({ place }),
      })
    ).resolves.toMatchObject({ status: 403 });
  });

  it("reports unavailable situation voice and sanitizes provisioning failures", async () => {
    const request = {
      method: "POST",
      headers: { origin },
      body: JSON.stringify({
        place: { name: "Restaurant", description: "A quiet restaurant." },
      }),
    };
    await expect(
      createPracticeRoutes(undefined, origin).request(
        "/situation-sessions",
        request
      )
    ).resolves.toMatchObject({ status: 503 });
    const { app, provider } = setup();
    provider.createSituationSession.mockRejectedValue(
      new Error("secret-provider-detail")
    );
    const response = await app.request("/situation-sessions", request);
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain(
      "secret-provider-detail"
    );
  });

  it("reports unavailable Chit and sanitizes provider errors", async () => {
    const request = { method: "POST", headers: { origin } };
    await expect(
      createPracticeRoutes(undefined, origin).request(
        "/place-sessions",
        request
      )
    ).resolves.toMatchObject({ status: 503 });
    const { app, provider } = setup();
    provider.createPlaceSession.mockRejectedValueOnce(
      new Error("private-provider-details")
    );
    const response = await app.request("/place-sessions", request);
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.not.toContain(
      "private-provider-details"
    );
    await expect(
      app.request("/place-sessions", request)
    ).resolves.toMatchObject({ status: 201 });
  });
});
