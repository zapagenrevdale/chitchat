import { describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import { createPracticeRoutes } from "./routes";

const origin = "https://amber.cc.local";
const scene = {
  place: { name: "Bookshop", description: "A quiet neighborhood bookshop." },
  situation: {
    name: "Ask for a novel",
    description: "Ask the bookseller for a recommendation.",
  },
};
function setup() {
  const recommendPersonas = vi
    .fn<NonNullable<PracticeProvider["recommendPersonas"]>>()
    .mockResolvedValue({
      name: "Book lovers",
      personaIds: ["sam", "vera", "theo"],
    });
  const app = createPracticeRoutes(
    {
      createSession: vi.fn<PracticeProvider["createSession"]>(),
      recommendPersonas,
    },
    origin
  );
  const request = (body: unknown = scene, from = origin) =>
    app.request("/persona-recommendations", {
      method: "POST",
      headers: { origin: from, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { request, recommendPersonas };
}
describe("Chit's persona recommendations", () => {
  it("passes the complete scene to AI and returns its ordered choices", async () => {
    const { request, recommendPersonas } = setup();
    const response = await request();
    expect(response.status).toBe(200);
    expect(recommendPersonas).toHaveBeenCalledWith(
      scene,
      expect.any(AbortSignal)
    );
    await expect(response.json()).resolves.toStrictEqual({
      name: "Book lovers",
      personaIds: ["sam", "vera", "theo"],
    });
  });

  it.each([
    ["sam", "vera"],
    ["sam", "sam", "theo"],
    ["sam", "vera", "invented"],
    ["sam", "vera", "theo", "maya", "leo", "zoe", "lily"],
  ])("rejects invalid AI choices %j", async (...personaIds) => {
    const { request, recommendPersonas } = setup();
    recommendPersonas.mockResolvedValue({ name: "Recommended", personaIds });
    await expect(request()).resolves.toMatchObject({ status: 502 });
  });

  it("rejects missing scene context and foreign origins before calling AI", async () => {
    const { request, recommendPersonas } = setup();
    await expect(request({ place: scene.place })).resolves.toMatchObject({
      status: 400,
    });
    await expect(
      request(scene, "https://other.example")
    ).resolves.toMatchObject({ status: 403 });
    expect(recommendPersonas).not.toHaveBeenCalled();
  });

  it("returns an error when AI fails instead of random choices", async () => {
    const { request, recommendPersonas } = setup();
    recommendPersonas.mockRejectedValue(new Error("Unavailable"));
    await expect(request()).resolves.toMatchObject({ status: 502 });
  });
});
