import {
  guidedTurnRequestSchema,
  guidedTurnSchema,
  practiceReplyRequestSchema,
  practiceReplySchema,
  practiceSpeechRequestSchema,
  practiceRecapSchema,
} from "@chitchat/contracts";
import { Hono } from "hono";
import type { Context } from "hono";

import { resolveSelection } from "./catalog";
import type { PracticeProvider } from "./gemini";
import { providerErrorStatus } from "./provider-error";

// These operations share cancellation and quota policy, including across the
// provider's fallback attempt. Validation and response shapes stay explicit.
async function prepareTurn(
  c: Context,
  generate: (signal: AbortSignal) => Promise<Response>
) {
  try {
    const signal = AbortSignal.any([
      c.req.raw.signal,
      AbortSignal.timeout(
        c.req.path.endsWith("/turn-speech") ? 50_000 : 25_000
      ),
    ]);
    signal.throwIfAborted();
    const response = await generate(signal);
    signal.throwIfAborted();
    return response;
  } catch (error) {
    if (providerErrorStatus(error) === 429) {
      return c.json(
        {
          error: c.req.path.endsWith("/reply-suggestions")
            ? "Reply suggestions have reached their usage limit. You can keep talking and try suggestions later."
            : "Guided practice has reached its usage limit. Please try again later or switch to Free talk.",
        },
        429
      );
    }
    return c.json(
      { error: "Couldn't prepare this turn. Please try again." },
      502
    );
  }
}

export function createConversationRoutes(
  provider:
    | Pick<PracticeProvider, "suggestReply" | "guidedTurn" | "speakTurn">
    | undefined
) {
  const app = new Hono();
  app.post("/reply-suggestions", async (c) => {
    const parsed = practiceReplyRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success || !resolveSelection(parsed.data.selection)) {
      return c.json({ error: "Check your conversation and try again." }, 400);
    }
    const suggestReply = provider?.suggestReply;
    if (!suggestReply) {
      return c.json({ error: "This feature is unavailable right now." }, 503);
    }
    return prepareTurn(c, async (signal) =>
      c.json(practiceReplySchema.parse(await suggestReply(parsed.data, signal)))
    );
  });
  app.post("/guided-turns", async (c) => {
    const parsed = guidedTurnRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success || !resolveSelection(parsed.data.selection)) {
      return c.json({ error: "Check your conversation and try again." }, 400);
    }
    const guidedTurn = provider?.guidedTurn;
    if (!guidedTurn) {
      return c.json({ error: "This feature is unavailable right now." }, 503);
    }
    return prepareTurn(c, async (signal) =>
      c.json(guidedTurnSchema.parse(await guidedTurn(parsed.data, signal)))
    );
  });
  app.post("/turn-speech", async (c) => {
    const parsed = practiceSpeechRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success || !resolveSelection(parsed.data.selection)) {
      return c.json({ error: "Check your conversation and try again." }, 400);
    }
    const speakTurn = provider?.speakTurn;
    if (!speakTurn) {
      return c.json({ error: "This feature is unavailable right now." }, 503);
    }
    return prepareTurn(c, async (signal) =>
      c.json(practiceRecapSchema.parse(await speakTurn(parsed.data, signal)))
    );
  });
  return app;
}
