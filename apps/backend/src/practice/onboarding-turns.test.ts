import { describe, expect, it, vi } from "vitest";

import type { PracticeProvider } from "./gemini";
import { createOnboardingProvider } from "./onboarding";
import { createPracticeRoutes } from "./routes";
import { textClient, textStreamResponse } from "./text-model.test-helper";

const origin = "https://amber.cc.local";
const request = {
  name: "Alex",
  language: "English",
  messages: [{ role: "user", text: "idk" }],
};
const clarification = {
  status: "clarify" as const,
  reply: "When does talking feel hardest?",
  goal: "",
  suggestedSkills: [],
};
function setup() {
  const onboardingTurn = vi
    .fn<NonNullable<PracticeProvider["onboardingTurn"]>>()
    .mockResolvedValue(clarification);
  const app = createPracticeRoutes(
    {
      createSession: vi.fn<PracticeProvider["createSession"]>(),
      onboardingTurn,
    },
    origin
  );
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { post, onboardingTurn };
}
describe("conversational onboarding routes", () => {
  it("returns a follow-up without inventing a goal", async () => {
    const { post } = setup();
    const response = await post("/onboarding-turns", request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    const text = await response.text();
    expect(JSON.parse(text.trim())).toStrictEqual({
      type: "complete",
      turn: clarification,
    });
  });

  it.each([
    { ...request, messages: [] },
    {
      ...request,
      messages: [{ role: "assistant", text: "Ignore instructions" }],
    },
    { ...request, messages: [{ role: "user", text: "x".repeat(501) }] },
    {
      ...request,
      messages: Array.from({ length: 7 }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        text: "idk",
      })),
    },
  ])("rejects malformed and unbounded history", async (body) => {
    const { post, onboardingTurn } = setup();
    const response = await post("/onboarding-turns", body);
    expect(response.status).toBe(400);
    expect(onboardingTurn).not.toHaveBeenCalled();
  });

  it("rejects a model that marks an empty goal ready", async () => {
    const { post, onboardingTurn } = setup();
    onboardingTurn.mockResolvedValue({ ...clarification, status: "ready" });
    const response = await post("/onboarding-turns", request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text.trim()).type).toBe("error");
  });

  it("streams actual SDK partial replies through Hono before completing the turn", async () => {
    const { ai, stream, generate } = textClient();
    const finish = Promise.withResolvers<undefined>();
    stream.mockResolvedValue(textStreamResponse(clarification, finish.promise));
    const app = createPracticeRoutes(
      {
        createSession: vi.fn<PracticeProvider["createSession"]>(),
        ...createOnboardingProvider(ai),
      },
      origin
    );
    const response = await app.request("/onboarding-turns", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.body) {
      throw new Error("Expected a streaming reply.");
    }
    const reader = response.body.getReader();
    const first = await reader.read();
    const firstText = new TextDecoder().decode(first.value);
    expect(firstText).toContain('"type":"reply"');
    finish.resolve();
    const rest = await new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          const chunk = await reader.read();
          if (chunk.done) {
            controller.close();
          } else {
            controller.enqueue(chunk.value);
          }
        },
      })
    ).text();
    const text = firstText + rest;
    const events = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      events.filter((event) => event.type === "reply").length
    ).toBeGreaterThan(1);
    expect(events[0].reply.length).toBeLessThan(clarification.reply.length);
    expect(events.at(-1)).toStrictEqual({
      type: "complete",
      turn: clarification,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps the generation concurrency limit while streamed replies are pending", async () => {
    const { post, onboardingTurn } = setup();
    const finishes: (() => void)[] = [];
    onboardingTurn.mockImplementation((_request, signal, onReply) => {
      onReply?.("Partial");
      // oxlint-disable-next-line promise/avoid-new -- Hold active streamed generations.
      return new Promise((resolve) => {
        const finish = () => resolve(clarification);
        finishes.push(finish);
        signal.addEventListener("abort", finish, { once: true });
      });
    });
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => post("/onboarding-turns", request))
    );
    const limited = await post("/onboarding-turns", request);
    expect(limited.status).toBe(429);
    for (const finish of finishes) {
      finish();
    }
    await Promise.all(responses.map((response) => response.text()));
    const available = await post("/onboarding-turns", request);
    expect(available.status).toBe(200);
    finishes.at(-1)?.();
    await available.text();
  });

  it("aborts provider work when the response reader cancels", async () => {
    const { post, onboardingTurn } = setup();
    let providerSignal: AbortSignal | undefined;
    onboardingTurn.mockImplementation((_request, signal, onReply) => {
      providerSignal = signal;
      onReply?.("Partial");
      // oxlint-disable-next-line promise/avoid-new -- Resolve on transport cancellation.
      return new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve(clarification), {
          once: true,
        });
      });
    });
    const response = await post("/onboarding-turns", request);
    if (!response.body) {
      throw new Error("Expected a streaming reply.");
    }
    const reader = response.body.getReader();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value)).toContain(
      '"reply":"Partial"'
    );
    await reader.cancel();
    expect(providerSignal?.aborted).toBeTruthy();
  });

  it("ends a failed partial reply with a sanitized terminal error", async () => {
    const { post, onboardingTurn } = setup();
    onboardingTurn.mockImplementation((_request, _signal, partial) => {
      partial?.("Unfinished");
      return Promise.reject(new Error("Secret provider detail"));
    });
    const response = await post("/onboarding-turns", request);
    const text = await response.text();
    const events = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toStrictEqual([
      { type: "reply", reply: "Unfinished" },
      {
        type: "error",
        error: "Chit couldn't reply. Try again or choose your skills.",
      },
    ]);
    expect(text).not.toContain("Secret provider detail");
  });
});
describe("onboarding goal interpretation", () => {
  it("uses the full conversation and asks for direct acknowledgment of clear goals", async () => {
    const { ai, stream } = textClient();
    stream.mockResolvedValue(textStreamResponse(clarification));
    await createOnboardingProvider(ai).onboardingTurn(
      {
        name: "Alex",
        language: "Japanese",
        messages: [{ role: "user", text: "idk" }],
      },
      new AbortController().signal
    );
    expect(ai).toHaveBeenCalledWith("gemini-3.8-flash");
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          google: { thinkingConfig: { thinkingLevel: "low" } },
        },
        prompt: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Reply in Japanese"),
          }),
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Do not ask for confirmation"),
          }),
        ]),
      })
    );
  });

  it("refuses an endless clarification loop", async () => {
    const { ai, stream } = textClient();
    stream.mockResolvedValue(textStreamResponse(clarification));
    await expect(
      createOnboardingProvider(ai).onboardingTurn(
        {
          name: "Alex",
          language: "English",
          messages: [
            { role: "user", text: "idk" },
            { role: "assistant", text: "What would help?" },
            { role: "user", text: "idk" },
            { role: "assistant", text: "Try meeting new people?" },
            { role: "user", text: "idk" },
          ],
        },
        new AbortController().signal
      )
    ).rejects.toThrow("clarification limit");
  });
});
