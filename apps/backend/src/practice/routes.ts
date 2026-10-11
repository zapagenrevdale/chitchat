import {
  practiceFeedbackRequestSchema,
  practiceFeedbackSchema,
  practiceRecapRequestSchema,
  practiceRecapSchema,
  personaRecommendationRequestSchema,
  personaRecommendationSchema,
  practiceScenePreviewRequestSchema,
  practiceScenePreviewSchema,
  practiceTraceBatchSchema,
  customSituationRequestSchema,
  placeImageRequestSchema,
  practiceSelectionSchema,
  practiceSetupRequestSchema,
} from "@chitchat/contracts";
import {
  onboardingTurnRequestSchema,
  onboardingTurnSchema,
  onboardingRecommendationRequestSchema,
  onboardingRecommendationSchema,
} from "@chitchat/contracts/onboarding";
import type { OnboardingTurnEvent } from "@chitchat/contracts/onboarding";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { getPracticeOptions, resolveSelection, validDraft } from "./catalog";
import { createConversationRoutes } from "./conversation-routes";
import { hasEnoughConversation } from "./feedback";
import type { PracticeProvider } from "./gemini";
import { createOnboardingLiveRoutes } from "./onboarding-live-routes";
import { personas } from "./personas";
import { providerErrorStatus } from "./provider-error";
import { applySetupAnswer, randomizeSetup, setupAnswerSchema } from "./setup";
import type { PracticeTracing } from "./tracing";
import type { CreateTranscriptionSession } from "./transcription";

// Covers 60,000 UTF-16 units escaped to six bytes, 300 x 128-byte message
// envelopes, and 32 KiB of context while schemas enforce semantic limits.
const transcriptBodyLimit = 512 * 1024;

export function createPracticeRoutes(
  provider: PracticeProvider | undefined,
  webOrigin: string,
  tracing?: PracticeTracing,
  createTranscriptionSession?: CreateTranscriptionSession
) {
  const app = new Hono<{
    Variables: { generationPending: Promise<void> | undefined };
  }>();
  let windowStart = Date.now();
  let requests = 0;
  let inFlight = 0;

  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.req.method !== "GET" && c.req.header("origin") !== webOrigin) {
      return c.json({ error: "This request must come from Chitchat." }, 403);
    }
    return await next();
  });
  // Telemetry uses its own bounded budget, separate from voice provisioning.
  app.post("/trace-events", bodyLimit({ maxSize: 60_000 }), async (c) => {
    if (!tracing) {
      return c.body(null, 204);
    }
    const parsed = practiceTraceBatchSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid trace events." }, 400);
    }
    const result = tracing.ingest(parsed.data);
    if (result === "unknown") {
      return c.json({ error: "Trace session unavailable." }, 404);
    }
    if (result === "limited") {
      return c.json({ error: "Trace event limit reached." }, 429);
    }
    return c.body(null, 204);
  });
  app.use("*", (c, next) => {
    let maxSize = 4096;
    if (c.req.path.endsWith("/onboarding-completions")) {
      maxSize = 64 * 1024;
    } else if (
      ["/feedback", "/reply-suggestions", "/guided-turns"].some((path) =>
        c.req.path.endsWith(path)
      )
    ) {
      maxSize = transcriptBodyLimit;
    } else if (
      ["/feedback-speech", "/onboarding-turns"].some((path) =>
        c.req.path.endsWith(path)
      )
    ) {
      maxSize = 8192;
    }
    return bodyLimit({
      maxSize,
      onError: (context) =>
        context.json({ error: "That request is too large." }, 413),
    })(c, next);
  });
  app.get("/options", (c) => c.json(getPracticeOptions(Boolean(provider))));
  // Bound generation and live provisioning for the anonymous MVP.
  app.use("*", async (c, next) => {
    if (Date.now() - windowStart >= 60_000) {
      windowStart = Date.now();
      requests = 0;
    }
    if (requests >= 30 || inFlight >= 4) {
      c.header("Retry-After", "60");
      return c.json(
        { error: "The practice studio is busy. Try again in a minute." },
        429
      );
    }
    requests += 1;
    inFlight += 1;
    try {
      return await next();
    } finally {
      const pending = c.get("generationPending");
      if (pending) {
        // oxlint-disable-next-line promise/prefer-await-to-then -- Release the quota without blocking the streaming response.
        void pending.finally(() => {
          inFlight -= 1;
        });
      } else {
        inFlight -= 1;
      }
    }
  });
  app.route("/", createConversationRoutes(provider));
  app.route("/", createOnboardingLiveRoutes(provider));
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
  app.post("/transcription-sessions", async (c) => {
    if (!createTranscriptionSession) {
      return c.json({ error: "Speech recognition is unavailable." }, 503);
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(10_000),
      ]);
      const token = await createTranscriptionSession(signal);
      signal.throwIfAborted();
      return c.json({ token }, 201);
    } catch {
      return c.json(
        { error: "Couldn't connect speech recognition. Please try again." },
        502
      );
    }
  });
  app.post("/feedback", async (c) => {
    const parsed = practiceFeedbackRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success || !resolveSelection(parsed.data.selection)) {
      return c.json(
        {
          error: "Couldn't read this conversation. Try a new practice session.",
        },
        400
      );
    }
    if (
      parsed.data.selection.mode === "guided" ||
      !hasEnoughConversation(parsed.data.messages)
    ) {
      return c.json({ status: "insufficient" });
    }
    if (!provider?.assessConversation) {
      return c.json({ error: "Feedback is unavailable right now." }, 503);
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(30_000),
      ]);
      const feedback = practiceFeedbackSchema.parse(
        await provider.assessConversation(parsed.data, signal)
      );
      signal.throwIfAborted();
      return c.json(feedback);
    } catch {
      return c.json(
        {
          error:
            "Couldn't assess this conversation. Your transcript is still here.",
        },
        502
      );
    }
  });
  app.post("/feedback-speech", async (c) => {
    const parsed = practiceRecapRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success || !resolveSelection(parsed.data.selection)) {
      return c.json({ error: "Invalid feedback recap." }, 400);
    }
    if (!provider?.speakFeedback) {
      return c.json(
        {
          error:
            "The voice recap is unavailable. Your written feedback is ready.",
        },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(50_000),
      ]);
      const recap = practiceRecapSchema.parse(
        await provider.speakFeedback(parsed.data, signal)
      );
      signal.throwIfAborted();
      return c.json(recap);
    } catch {
      return c.json(
        {
          error:
            "The voice recap couldn't finish. Your written feedback is ready.",
        },
        502
      );
    }
  });
  app.post("/scene-previews", async (c) => {
    const parsed = practiceScenePreviewRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (
      !parsed.success ||
      !personas.some(({ id }) => id === parsed.data.personaId)
    ) {
      return c.json(
        {
          error:
            "Choose a place, situation, and persona. Keep the backstory under 1,000 characters.",
        },
        400
      );
    }
    if (!provider?.generateScenePreview) {
      return c.json(
        { error: "Chit’s scene previews are unavailable right now." },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(25_000),
      ]);
      const preview = practiceScenePreviewSchema.parse(
        await provider.generateScenePreview(parsed.data, signal)
      );
      signal.throwIfAborted();
      return c.json(preview);
    } catch (error) {
      if (providerErrorStatus(error) === 429) {
        c.header("Retry-After", "60");
        return c.json(
          {
            error:
              "Chit has reached its request limit. Please try again later.",
          },
          429
        );
      }
      return c.json(
        { error: "Chit couldn’t prepare your scene. Please try again." },
        502
      );
    }
  });
  app.post("/persona-recommendations", async (c) => {
    const parsed = personaRecommendationRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json({ error: "Choose a place and situation first." }, 400);
    }
    if (!provider?.recommendPersonas) {
      return c.json(
        { error: "Chit's recommendations are unavailable right now." },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(25_000),
      ]);
      const recommendation = personaRecommendationSchema.parse(
        await provider.recommendPersonas(parsed.data, signal)
      );
      signal.throwIfAborted();
      if (
        new Set(recommendation.personaIds).size !==
          recommendation.personaIds.length ||
        recommendation.personaIds.some(
          (id) => !personas.some((persona) => persona.id === id)
        )
      ) {
        throw new Error("Invalid recommended personas.");
      }
      return c.json(recommendation);
    } catch {
      return c.json(
        { error: "Chit couldn't recommend personas. Please try again." },
        502
      );
    }
  });
  app.post("/place-images", async (c) => {
    const parsed = placeImageRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        { error: "Choose a place before creating its image." },
        400
      );
    }
    if (
      parsed.data.scene &&
      !personas.some(({ id }) => id === parsed.data.scene?.personaId)
    ) {
      return c.json(
        { error: "Choose an available persona for this scene." },
        400
      );
    }
    if (!provider?.generatePlaceImage) {
      return c.json({ error: "Place images are unavailable right now." }, 503);
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(60_000),
      ]);
      const image = await provider.generatePlaceImage(parsed.data, signal);
      signal.throwIfAborted();
      return c.json({ image });
    } catch {
      return c.json(
        { error: "Couldn't create the place image. Please try again." },
        502
      );
    }
  });
  app.post("/setup", async (c) => {
    const parsed = practiceSetupRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success || !validDraft(parsed.data.selection)) {
      return c.json({ error: "Check your choices and try again." }, 400);
    }
    const request = parsed.data;
    if (request.action !== "answer") {
      return c.json({ selection: randomizeSetup(request) });
    }
    const randomPhrase = request.text
      ?.toLowerCase()
      .replaceAll(/[.!?]/gu, "")
      .trim();
    if (
      ["random", "anywhere", "anything", "pick for me", "surprise me"].includes(
        randomPhrase ?? ""
      )
    ) {
      return c.json({
        selection: randomizeSetup({ ...request, action: "random" }),
      });
    }
    if (
      [
        "surprise me with everything",
        "random everything",
        "random all",
      ].includes(randomPhrase ?? "")
    ) {
      return c.json({
        selection: randomizeSetup({ ...request, action: "random-all" }),
      });
    }
    if (!provider?.interpretSetup) {
      return c.json(
        {
          error:
            "Custom answers are unavailable right now. You can still pick a card or use Surprise me.",
        },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(25_000),
      ]);
      const answer = setupAnswerSchema.parse(
        await provider.interpretSetup(request, signal)
      );
      signal.throwIfAborted();
      const selection = applySetupAnswer(request, answer);
      if (!validDraft(selection)) {
        throw new Error("Invalid setup answer.");
      }
      if (
        !answer.place &&
        !answer.setting &&
        !answer.difficulty &&
        !answer.personaId &&
        answer.random === "none"
      ) {
        return c.json(
          {
            error:
              "I couldn't find a new choice in that answer. Try a place, situation, level, or partner name.",
          },
          422
        );
      }
      return c.json({ selection });
    } catch {
      return c.json(
        {
          error:
            "Couldn't use that answer right now. Try again or pick an option below.",
        },
        502
      );
    }
  });
  app.post("/sessions", async (c) => {
    if (!provider) {
      return c.json(
        {
          error:
            "Voice practice is not configured yet. Please try again later.",
        },
        503
      );
    }
    const parsed = practiceSelectionSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success || !resolveSelection(parsed.data)) {
      return c.json(
        {
          error: "Choose a partner, place, and situation before starting.",
        },
        400
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(25_000),
      ]);
      const session = await provider.createSession(parsed.data, signal);
      signal.throwIfAborted();
      // Caption provisioning must not prevent the audio conversation starting.
      let transcriptionToken: string | null | undefined;
      if (createTranscriptionSession) {
        try {
          const captionSignal = AbortSignal.any([
            signal,
            AbortSignal.timeout(5000),
          ]);
          transcriptionToken = await createTranscriptionSession(captionSignal);
          captionSignal.throwIfAborted();
        } catch {
          transcriptionToken = null;
        }
      }
      c.req.raw.signal.throwIfAborted();
      return c.json({ ...session, transcriptionToken }, 201);
    } catch {
      return c.json(
        { error: "Couldn't connect to voice practice. Please try again." },
        502
      );
    }
  });
  app.post("/place-sessions", async (c) => {
    if (!provider?.createPlaceSession) {
      return c.json(
        {
          error:
            "Chit's voice is unavailable right now. Please try again later.",
        },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(25_000),
      ]);
      const session = await provider.createPlaceSession(signal);
      signal.throwIfAborted();
      return c.json(session, 201);
    } catch {
      return c.json(
        { error: "Couldn't connect to Chit. Please try again." },
        502
      );
    }
  });
  app.post("/situation-sessions", async (c) => {
    const parsed = customSituationRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        { error: "Choose a place before describing a situation." },
        400
      );
    }
    if (!provider?.createSituationSession) {
      return c.json(
        {
          error:
            "Chit's voice is unavailable right now. Please try again later.",
        },
        503
      );
    }
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(25_000),
      ]);
      const session = await provider.createSituationSession(
        parsed.data.place,
        signal
      );
      signal.throwIfAborted();
      return c.json(session, 201);
    } catch {
      return c.json(
        { error: "Couldn't connect to Chit. Please try again." },
        502
      );
    }
  });
  return app;
}
