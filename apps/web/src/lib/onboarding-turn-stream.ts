import { onboardingTurnEventSchema } from "@chitchat/contracts/onboarding";
import type { OnboardingTurn } from "@chitchat/contracts/onboarding";

export async function readOnboardingTurn(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onReply: (reply: string) => void
): Promise<OnboardingTurn> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let received = 0;
  let turn: OnboardingTurn | undefined;
  const cancel = async () => {
    try {
      await reader.cancel();
    } catch {
      // The read failure is reported by the request, not cancellation cleanup.
    }
  };
  signal.addEventListener("abort", cancel, { once: true });
  function consume(line: string) {
    if (!line.trim()) {
      return;
    }
    if (turn) {
      throw new Error("Unexpected event after the completed reply.");
    }
    const event = onboardingTurnEventSchema.parse(JSON.parse(line));
    if (event.type === "error") {
      throw new Error(event.error);
    }
    if (event.type === "complete") {
      ({ turn } = event);
    } else {
      onReply(event.reply);
    }
  }
  try {
    signal.throwIfAborted();
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Read chunks in their network order.
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        buffer += decoder.decode();
        if (buffer.length) {
          throw new Error("The reply stream ended unexpectedly.");
        }
        if (!turn) {
          throw new Error("The reply did not finish. Please try again.");
        }
        return turn;
      }
      received += value.byteLength;
      if (received > 262_144) {
        throw new Error("The reply stream is too large.");
      }
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        consume(buffer.slice(0, newline));
        signal.throwIfAborted();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await cancel();
    reader.releaseLock();
  }
}
