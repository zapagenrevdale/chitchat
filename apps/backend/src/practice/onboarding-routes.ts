import { randomUUID } from "node:crypto";

import {
  onboardingLiveRequestSchema,
  onboardingLiveSessionSchema,
  onboardingTurnRequestSchema,
  onboardingTurnSchema,
  onboardingRecommendationRequestSchema,
  onboardingRecommendationSchema,
  onboardingVoiceCompletionRequestSchema,
  onboardingVoiceCompletionSchema,
} from "@chitchat/contracts/onboarding";
import type { OnboardingTurnEvent } from "@chitchat/contracts/onboarding";
import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";

import { bypassDevelopmentLimits } from "../development-limits";
import type { DevelopmentLimits } from "../development-limits";
import type { PracticeProvider } from "./gemini";

const quotaWindowMs = 3_600_000;
const visitorSessionLimit = 3;
const globalSessionLimit = 20;

// Anonymous MVP limits are process-local. Cookie resets can bypass the visitor
// budget, so the global ceiling remains independent of visitor identity.
export function createOnboardingRoutes(
  provider: PracticeProvider | undefined,
  limits?: DevelopmentLimits
) {
  const limitsDisabled = bypassDevelopmentLimits(limits);
  const app = new Hono<{
    Variables: { generationPending: Promise<void> | undefined };
  }>();
  const secret = randomUUID();
  const visitors = new Map<string, number>();
  let windowStart = Date.now();
  let issued = 0;
  app.post("/onboarding-sessions", async (c) => {
    const parsed = onboardingLiveRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid onboarding conversation." }, 400);
    }
    if (!provider?.createOnboardingSession) {
      return c.json(
        { error: "Live onboarding is unavailable. You can type instead." },
        503
      );
    }
    if (Date.now() - windowStart >= quotaWindowMs) {
      windowStart = Date.now();
      issued = 0;
      visitors.clear();
    }
    const cookieName = "chitchat-onboarding-voice";
    const existing = await getSignedCookie(c, secret, cookieName);
    const visitor = existing || randomUUID();
    const attempts = visitors.get(visitor) ?? 0;
    if (
      !limitsDisabled &&
      (attempts >= visitorSessionLimit || issued >= globalSessionLimit)
    ) {
      c.header(
        "Retry-After",
        String(
          Math.max(
            1,
            Math.ceil((windowStart + quotaWindowMs - Date.now()) / 1000)
          )
        )
      );
      return c.json(
        {
          error:
            "Voice setup has reached its limit. You can still type or choose your skills.",
        },
        429
      );
    }
    // Reserve before provisioning so parallel requests cannot exceed the quota.
    visitors.set(visitor, attempts + 1);
    issued += 1;
    await setSignedCookie(c, cookieName, visitor, secret, {
      httpOnly: true,
      secure: c.req.url.startsWith("https:"),
      sameSite: "Strict",
      path: "/",
      maxAge: 3600,
    });
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(20_000),
      ]);
      const session = onboardingLiveSessionSchema.parse(
        await provider.createOnboardingSession(parsed.data, signal)
      );
      signal.throwIfAborted();
      return c.json(session);
    } catch {
      return c.json(
        {
          error: "Live onboarding couldn't connect. Try again or type instead.",
        },
        502
      );
    }
  });
  app.post("/onboarding-completions", async (c) => {
    const parsed = onboardingVoiceCompletionRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid onboarding goal or transcript." }, 400);
    }
    if (!provider?.completeOnboarding) {
      return c.json(
        {
          error: "Your goal couldn't finish. Try again or choose your skills.",
        },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(10_000),
      ]);
      const completion = onboardingVoiceCompletionSchema.parse(
        await provider.completeOnboarding(parsed.data, signal)
      );
      signal.throwIfAborted();
      return c.json(completion);
    } catch {
      return c.json(
        {
          error: "Your goal couldn't finish. Try again or choose your skills.",
        },
        502
      );
    }
  });
  app.post("/onboarding-turns", async (c) => {
    const parsed = onboardingTurnRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid onboarding conversation." }, 400);
    }
    if (!provider?.onboardingTurn) {
      return c.json(
        { error: "Chit couldn't reply. Try again or choose your skills." },
        503
      );
    }
    const cancellation = new AbortController();
    const signal = AbortSignal.any([
      c.req.raw.signal,
      cancellation.signal,
      AbortSignal.timeout(25_000),
    ]);
    const encoder = new TextEncoder();
    const { onboardingTurn } = provider;
    const { data } = parsed;
    async function generate(
      controller: ReadableStreamDefaultController<Uint8Array>
    ) {
      function write(event: OnboardingTurnEvent) {
        if (!cancellation.signal.aborted) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      }
      try {
        const result = onboardingTurnSchema.parse(
          await onboardingTurn(data, signal, (reply) => {
            signal.throwIfAborted();
            write({ type: "reply", reply });
          })
        );
        signal.throwIfAborted();
        write({ type: "complete", turn: result });
      } catch {
        write({
          type: "error",
          error: "Chit couldn't reply. Try again or choose your skills.",
        });
      } finally {
        if (!cancellation.signal.aborted) {
          controller.close();
        }
      }
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const pending = generate(controller);
        c.set("generationPending", pending);
        return pending;
      },
      cancel() {
        cancellation.abort();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
  app.post("/onboarding-recommendations", async (c) => {
    const parsed = onboardingRecommendationRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        { error: "Add your name and a short reason for practicing." },
        400
      );
    }
    if (!provider?.recommendOnboarding) {
      return c.json(
        {
          error: "Suggestions are unavailable. You can choose your own skills.",
        },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(25_000),
      ]);
      const result = onboardingRecommendationSchema.parse(
        await provider.recommendOnboarding(parsed.data, signal)
      );
      signal.throwIfAborted();
      return c.json(result);
    } catch {
      return c.json(
        {
          error: "Suggestions couldn't load. You can still choose any skills.",
        },
        502
      );
    }
  });
  return app;
}
