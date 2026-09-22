import { createHash, randomUUID } from "node:crypto";

import type {
  PracticeSession,
  PracticeTraceBatch,
  PracticeTraceEvent,
} from "@chitchat/contracts";
import { ApiError } from "@google/genai";
import { startObservation } from "@langfuse/tracing";
import type {
  LangfuseSpan,
  LangfuseGeneration,
  LangfuseGenerationAttributes,
} from "@langfuse/tracing";

interface TurnTrace {
  root: LangfuseSpan;
  generation?: LangfuseGeneration;
  userId?: number;
  partnerId?: number;
  userText: string;
  lastEventAt: Date;
}

interface LiveTrace {
  root: LangfuseSpan;
  model: string;
  systemInstruction: string;
  turn?: TurnTrace;
  timer: ReturnType<typeof setTimeout>;
  events: number;
  windowStart: number;
  windowEvents: number;
  lastSequence: number;
}

function finishTurn(session: LiveTrace) {
  if (session.turn) {
    session.turn.generation?.end(session.turn.lastEventAt);
    session.turn.root.end(session.turn.lastEventAt);
    session.turn = undefined;
  }
}

function record(session: LiveTrace, event: PracticeTraceEvent) {
  const metadata = {
    source: "browser",
    clientTimestamp: event.timestamp,
    sequence: event.sequence,
  };
  if (event.type === "transcript") {
    const previous = session.turn;
    const newTurn =
      !previous ||
      (event.speaker === "user"
        ? previous.userId !== event.messageId
        : previous.partnerId !== undefined &&
          previous.partnerId !== event.messageId);
    if (newTurn) {
      finishTurn(session);
      const root = startObservation("practice.turn", {
        metadata: { model: session.model },
      });
      root.otelSpan.setAttribute("session.id", session.root.traceId);
      session.turn = { root, userText: "", lastEventAt: new Date() };
    }
    const { turn } = session;
    if (!turn) {
      return;
    }
    turn.lastEventAt = new Date();
    if (event.speaker === "user") {
      turn.userId = event.messageId;
      turn.userText = event.text;
      turn.root.update({
        input: [{ role: "user", content: event.text }],
        metadata: { ...metadata, messageId: event.messageId },
      });
      turn.generation?.update({
        input: [
          { role: "system", content: session.systemInstruction },
          { role: "user", content: event.text },
        ],
      });
    } else {
      turn.partnerId = event.messageId;
      turn.generation ??= turn.root.startObservation(
        "generate-live-response",
        {
          model: session.model,
          input: [
            { role: "system", content: session.systemInstruction },
            { role: "user", content: turn.userText },
          ],
          metadata: {
            inputScope:
              "system prompt and current user transcript; Gemini retains earlier audio context",
          },
        },
        { asType: "generation" }
      );
      turn.generation.otelSpan.setAttribute("session.id", session.root.traceId);
      turn.generation.update({
        output: [{ role: "assistant", content: event.text }],
        metadata,
      });
      turn.root.update({
        output: [{ role: "assistant", content: event.text }],
      });
    }
    return;
  }
  const parent =
    event.type === "tool" && session.turn ? session.turn.root : session.root;
  const observation =
    event.type === "tool"
      ? parent.startObservation(
          event.name,
          {
            input: event.arguments,
            output: { accepted: event.accepted },
            metadata: { ...metadata, callId: event.callId },
            level: event.accepted ? "DEFAULT" : "WARNING",
          },
          { asType: "tool" }
        )
      : parent.startObservation(`live.${event.name}`, {
          input: event.detail,
          metadata,
          level: event.name === "error" ? "ERROR" : "DEFAULT",
        });
  observation.otelSpan.setAttribute("session.id", session.root.traceId);
  observation.end();
  if (event.type === "tool" && session.turn) {
    session.turn.lastEventAt = new Date();
  }
}

export class PracticeTracing {
  private sessions = new Map<string, LiveTrace>();

  async provision(
    input: {
      systemInstruction: string;
      model: string;
      voiceName: string;
      tools: unknown;
    },
    run: () => Promise<PracticeSession>
  ): Promise<PracticeSession> {
    // Tracing must never prevent a call when the bounded registry is full.
    if (this.sessions.size >= 500) {
      return await run();
    }
    const root = startObservation("practice.live", {
      input,
      metadata: {
        promptHash: createHash("sha256")
          .update(input.systemInstruction)
          .digest("hex"),
      },
    });
    root.otelSpan.setAttribute("session.id", root.traceId);
    const provisioning = root.startObservation("provision-live-session");
    provisioning.otelSpan.setAttribute("session.id", root.traceId);
    try {
      const session = await run();
      // Only this random capability is accepted by the event endpoint. Neither
      // Gemini tokens nor Langfuse credentials are recorded in the trace.
      const tracingToken = randomUUID();
      const timer = setTimeout(
        () => {
          this.finish(tracingToken, "telemetry_expired", true);
        },
        Math.max(0, session.expiresAt - Date.now()) + 60_000
      );
      timer.unref?.();
      this.sessions.set(tracingToken, {
        root,
        model: input.model,
        systemInstruction: input.systemInstruction,
        timer,
        events: 0,
        windowStart: Date.now(),
        windowEvents: 0,
        lastSequence: -1,
      });
      provisioning.update({
        output: { model: session.model, expiresAt: session.expiresAt },
      });
      return { ...session, tracingToken };
    } catch (error) {
      provisioning.update({
        level: "ERROR",
        statusMessage: "Gemini provisioning failed",
      });
      root.update({
        level: "ERROR",
        output: { reason: "provisioning_failed" },
      });
      root.end();
      throw error;
    } finally {
      provisioning.end();
    }
  }

  sessionId(token?: string) {
    return token ? this.sessions.get(token)?.root.traceId : undefined;
  }

  ingest(batch: PracticeTraceBatch): "accepted" | "unknown" | "limited" {
    const session = this.sessions.get(batch.tracingToken);
    if (!session) {
      return "unknown";
    }
    if (Date.now() - session.windowStart >= 60_000) {
      session.windowStart = Date.now();
      session.windowEvents = 0;
    }
    if (
      session.events + batch.events.length > 2000 ||
      session.windowEvents + batch.events.length > 240
    ) {
      return "limited";
    }
    session.events += batch.events.length;
    session.windowEvents += batch.events.length;
    for (const event of batch.events) {
      session.lastSequence = Math.max(session.lastSequence, event.sequence);
      record(session, event);
      if (event.type === "lifecycle" && event.name === "closed") {
        this.finish(batch.tracingToken, event.detail ?? "closed");
        break;
      }
    }
    return "accepted";
  }

  private finish(token: string, reason: string, incomplete = false) {
    const session = this.sessions.get(token);
    if (!session) {
      return;
    }
    finishTurn(session);
    clearTimeout(session.timer);
    session.root.update({
      output: {
        reason,
        events: session.events,
        missingEvents: Math.max(0, session.lastSequence + 1 - session.events),
      },
      level: incomplete ? "WARNING" : "DEFAULT",
    });
    session.root.end();
    this.sessions.delete(token);
  }

  close() {
    for (const token of this.sessions.keys()) {
      this.finish(token, "backend_shutdown", true);
    }
  }
}

export function tokenUsage(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}) {
  if (!usage) {
    return;
  }
  return {
    ...(usage.promptTokenCount === undefined
      ? {}
      : { input: usage.promptTokenCount }),
    ...(usage.candidatesTokenCount === undefined
      ? {}
      : {
          output: usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0),
        }),
  };
}

export async function traceGeneration<T>(
  name: string,
  attributes: LangfuseGenerationAttributes,
  run: (observation: LangfuseGeneration) => Promise<T>,
  summarize: (result: T) => LangfuseGenerationAttributes = (result) => ({
    output: result,
  }),
  sessionId?: string
): Promise<T> {
  const observation = startObservation(name, attributes, {
    asType: "generation",
  });
  if (sessionId) {
    observation.otelSpan.setAttribute("session.id", sessionId);
  }
  try {
    const result = await run(observation);
    observation.update(summarize(result));
    return result;
  } catch (error) {
    // Provider errors can contain request URLs or credentials.
    observation.update({
      level: "ERROR",
      statusMessage:
        error instanceof ApiError
          ? `Gemini request failed (HTTP ${error.status})`
          : "Gemini request failed",
    });
    throw error;
  } finally {
    observation.end();
  }
}
