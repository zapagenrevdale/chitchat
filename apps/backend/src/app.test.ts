import { healthSchema, scenariosSchema } from "@chitchat/contracts";
import { describe, expect, it } from "vitest";

import { createApp } from "./app";

const webOrigin = "https://chitchat.local";
const app = createApp({
  webOrigin,
  authHandler: () => Response.json({ status: "ok" }),
  getUser: () => Promise.resolve(null),
});

describe("shared API", () => {
  it("serves public health and scenario contracts without authentication", async () => {
    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(healthSchema.safeParse(await health.json()).success).toBeTruthy();
    const response = await app.request("/api/scenarios");
    expect(scenariosSchema.parse(await response.json()).length).toBeGreaterThan(
      0
    );
  });

  it("rejects anonymous requests to the account endpoint", async () => {
    const response = await app.request("/api/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns the authenticated user and forwards session headers", async () => {
    const user = { id: "user-1", name: "Alex", email: "alex@example.com" };
    const authenticated = createApp({
      webOrigin,
      authHandler: () => new Response(),
      getUser: (headers) =>
        Promise.resolve(
          headers.get("cookie") === "session=valid" ? user : null
        ),
    });
    const response = await authenticated.request("/api/me", {
      headers: { cookie: "session=valid" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ user });
  });

  it("permits credentialed requests from the configured web origin only", async () => {
    const allowed = await app.request("/api/scenarios", {
      headers: { origin: webOrigin },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(webOrigin);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe(
      "true"
    );
    const other = "https://other.example";
    const denied = await app.request("/api/scenarios", {
      headers: { origin: other },
    });
    expect(denied.headers.get("access-control-allow-origin")).not.toBe(other);
  });
});
