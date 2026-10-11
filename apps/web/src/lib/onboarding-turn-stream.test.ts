import { afterEach, describe, expect, it, vi } from "vitest";

import { readOnboardingTurn } from "./onboarding-turn-stream";
import { replyToOnboarding } from "./practice-api";

const turn = {
  status: "ready",
  reply: "Let's practice conversations.",
  goal: "Meet people",
  suggestedSkills: ["conversation-flow"],
  benefits: {
    ids: ["start-conversations", "keep-it-going", "listen-and-connect"],
    personalized: true,
  },
};
function controlledStream() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn<() => void>();
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel,
  });
  const encoder = new TextEncoder();
  return {
    body,
    cancel,
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}
describe("onboarding reply stream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders snapshots before final validation and preserves benefits", async () => {
    const stream = controlledStream();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(stream.body, {
          headers: { "Content-Type": "application/x-ndjson" },
        })
      )
    );
    const onReply = vi.fn<(reply: string) => void>();
    const finished = vi.fn<() => void>();
    const result = replyToOnboarding(
      {
        name: "Alex",
        language: "English",
        messages: [{ role: "user", text: "Meet people" }],
      },
      new AbortController().signal,
      onReply
    ).then((value) => {
      finished();
      return value;
    });
    stream.send('{"type":"reply","reply":"Let');
    await vi.waitFor(() => expect(onReply).not.toHaveBeenCalled());
    stream.send('s practice"}\n');
    await vi.waitFor(() =>
      expect(onReply).toHaveBeenCalledExactlyOnceWith("Lets practice")
    );
    expect(finished).not.toHaveBeenCalled();
    stream.send(`${JSON.stringify({ type: "complete", turn })}\n`);
    stream.close();
    await expect(result).resolves.toStrictEqual(turn);
  });

  it.each([
    '{"type":"reply","reply":"Partial"}\n',
    '{"type":"reply","reply":"Partial"}\n{"type":"complete"',
    '{"type":"reply","reply":"Partial"}\n{"type":"error","error":"Try again"}\n',
    `${JSON.stringify({ type: "complete", turn: { ...turn, goal: "" } })}\n`,
    `${JSON.stringify({ type: "complete", turn: { ...turn, benefits: { ids: [], personalized: true } } })}\n`,
    '{"type":"unknown"}\n',
  ])("rejects incomplete, failed or invalid streams", async (text) => {
    const stream = controlledStream();
    const result = readOnboardingTurn(
      stream.body,
      new AbortController().signal,
      vi.fn<(reply: string) => void>()
    );
    stream.send(text);
    stream.close();
    await expect(result).rejects.toThrow(/.+/u);
  });

  it("cancels a pending read and suppresses output after abort", async () => {
    const stream = controlledStream();
    const controller = new AbortController();
    const onReply = vi.fn<(reply: string) => void>();
    const result = readOnboardingTurn(stream.body, controller.signal, onReply);
    controller.abort();
    await expect(result).rejects.toThrow(/abort/iu);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(onReply).not.toHaveBeenCalled();
  });

  it("decodes split multi-byte characters", async () => {
    const encoded = new TextEncoder().encode(
      '{"type":"reply","reply":"こんにちは"}\n'
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of encoded) {
          controller.enqueue(new Uint8Array([byte]));
        }
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "complete", turn })}\n`
          )
        );
        controller.close();
      },
    });
    const onReply = vi.fn<(reply: string) => void>();
    await readOnboardingTurn(body, new AbortController().signal, onReply);
    expect(onReply).toHaveBeenCalledExactlyOnceWith("こんにちは");
  });

  it("accepts dense cumulative snapshots for a maximum-length Japanese reply", async () => {
    const stream = controlledStream();
    const reply = "話".repeat(240);
    const completed = { ...turn, reply };
    const onReply = vi.fn<(reply: string) => void>();
    const result = readOnboardingTurn(
      stream.body,
      new AbortController().signal,
      onReply
    );
    for (let length = 1; length <= reply.length; length += 1) {
      stream.send(
        `${JSON.stringify({ type: "reply", reply: reply.slice(0, length) })}\n`
      );
    }
    stream.send(`${JSON.stringify({ type: "complete", turn: completed })}\n`);
    stream.close();
    await expect(result).resolves.toStrictEqual(completed);
    expect(onReply).toHaveBeenCalledTimes(240);
    expect(onReply).toHaveBeenLastCalledWith(reply);
  });

  it("still rejects oversized streams", async () => {
    const stream = controlledStream();
    const result = readOnboardingTurn(
      stream.body,
      new AbortController().signal,
      vi.fn<(reply: string) => void>()
    );
    stream.send(" ".repeat(262_145));
    await expect(result).rejects.toThrow("The reply stream is too large.");
    expect(stream.cancel).toHaveBeenCalledOnce();
  });

  it.each([413, 429, 503])(
    "rejects HTTP %s before reading a reply",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json({ error: "Private details" }, { status })
          )
      );
      const onReply = vi.fn<(reply: string) => void>();
      await expect(
        replyToOnboarding(
          {
            name: "Alex",
            language: "English",
            messages: [{ role: "user", text: "Meet people" }],
          },
          new AbortController().signal,
          onReply
        )
      ).rejects.toMatchObject({
        status,
        message: "Chit couldn't reply. Try again or choose your skills.",
      });
      expect(onReply).not.toHaveBeenCalled();
    }
  );

  it("rejects a transport error after partial text", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const onReply = vi.fn<(reply: string) => void>();
    const result = readOnboardingTurn(
      body,
      new AbortController().signal,
      onReply
    );
    controller.enqueue(
      new TextEncoder().encode('{"type":"reply","reply":"Partial"}\n')
    );
    await vi.waitFor(() => expect(onReply).toHaveBeenCalledWith("Partial"));
    controller.error(new Error("Connection lost"));
    await expect(result).rejects.toThrow("Connection lost");
  });
});
