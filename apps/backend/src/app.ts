import type { Scenario } from "@chitchat/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import type { DevelopmentLimits } from "./development-limits";
import type { PracticeProvider } from "./practice/gemini";
import { createPracticeRoutes } from "./practice/routes";
import type { PracticeTracing } from "./practice/tracing";
import type { CreateTranscriptionSession } from "./practice/transcription";

const scenarios: Scenario[] = [
  {
    id: "coworker",
    title: "The coffee break",
    description: "Find a little common ground with a coworker.",
  },
  {
    id: "new-friend",
    title: "A friend of a friend",
    description: "Turn a first introduction into an easy conversation.",
  },
  {
    id: "neighbour",
    title: "Around the neighbourhood",
    description: "Make the next familiar face feel a little more familiar.",
  },
];

interface AppOptions {
  createTranscriptionSession?: CreateTranscriptionSession;
  practiceProvider?: PracticeProvider;
  practiceTracing?: PracticeTracing;
  developmentLimits?: DevelopmentLimits;
  webOrigin: string;
  authHandler: (request: Request) => Response | Promise<Response>;
  getUser: (
    headers: Headers
  ) => Promise<{ id: string; name: string; email: string } | null>;
}

export function createApp(options: AppOptions) {
  const app = new Hono();
  app.use(requestId());
  app.use(secureHeaders());
  app.use("/api/*", cors({ origin: options.webOrigin, credentials: true }));

  app.get("/health", (c) => c.json({ status: "ok", service: "chitchat-api" }));
  app.all("/api/auth/*", (c) => options.authHandler(c.req.raw));
  app.route(
    "/api/practice",
    createPracticeRoutes(
      options.practiceProvider,
      options.webOrigin,
      options.practiceTracing,
      options.createTranscriptionSession,
      options.developmentLimits
    )
  );
  app.get("/api/scenarios", (c) => c.json(scenarios));
  app.get("/api/me", async (c) => {
    c.header("Cache-Control", "no-store");
    const user = await options.getUser(c.req.raw.headers);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json({ user });
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  // Hono requires an error-handler callback.
  // oxlint-disable-next-line promise/prefer-await-to-callbacks
  app.onError((error, c) => {
    console.error("Request failed", c.get("requestId"), error);
    return c.json({ error: "Internal server error" }, 500);
  });
  return app;
}
