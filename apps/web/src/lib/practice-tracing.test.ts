import { practiceTraceBatchSchema } from "@chitchat/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PracticeTraceQueue } from "./practice-tracing";

const requests = vi.fn<typeof fetch>();
describe("voice tracing delivery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requests.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", requests);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("batches in sequence, uses the session capability, and flushes the closing event", async () => {
    const token = crypto.randomUUID();
    const queue = new PracticeTraceQueue(token);
    queue.record({
      type: "transcript",
      speaker: "user",
      text: "See ya",
      messageId: 1,
    });
    queue.record({
      type: "tool",
      name: "end_conversation",
      arguments: '{"reason":"mutual_goodbye"}',
      accepted: true,
    });
    expect(requests).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    const batch = practiceTraceBatchSchema.parse(
      JSON.parse(String(requests.mock.calls[0]?.[1]?.body))
    );
    expect({
      token: batch.tracingToken,
      sequences: batch.events.map((event) => event.sequence),
    }).toStrictEqual({ token, sequences: [0, 1] });
    queue.record({
      type: "lifecycle",
      name: "closed",
      detail: "mutual_goodbye",
    });
    queue.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveBeenCalledTimes(2);
    expect(requests.mock.calls[1]?.[1]?.keepalive).toBeTruthy();
    expect(String(requests.mock.calls[1]?.[1]?.body)).toContain("closed");
  });

  it("does not throw or retry indefinitely when telemetry is unavailable", async () => {
    requests.mockRejectedValue(new Error("offline"));
    const queue = new PracticeTraceQueue(crypto.randomUUID());
    queue.record({ type: "lifecycle", name: "connected" });
    await vi.advanceTimersByTimeAsync(2000);
    queue.record({ type: "lifecycle", name: "closed" });
    queue.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it("splits Unicode payloads within the backend and keepalive byte limits", async () => {
    const queue = new PracticeTraceQueue(crypto.randomUUID());
    for (let index = 0; index < 8; index += 1) {
      queue.record({
        type: "transcript",
        speaker: "user",
        text: "語".repeat(8000),
        messageId: index,
      });
    }
    queue.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests.mock.calls.length).toBeGreaterThan(1);
    for (const [, request] of requests.mock.calls) {
      const body = String(request?.body);
      expect(new TextEncoder().encode(body).length).toBeLessThan(60_000);
      expect(
        practiceTraceBatchSchema.safeParse(JSON.parse(body)).success
      ).toBeTruthy();
    }
  });
});
