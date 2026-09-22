import type { PracticeTraceEvent } from "@chitchat/contracts";

import { apiUrl } from "./env";

type TraceEventInput = PracticeTraceEvent extends infer Event
  ? Event extends PracticeTraceEvent
    ? Omit<Event, "sequence" | "timestamp">
    : never
  : never;

// Best-effort diagnostic delivery. Audio never waits for this queue.
export class PracticeTraceQueue {
  private events: PracticeTraceEvent[] = [];
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private sending = false;
  private closed = false;

  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  record(event: TraceEventInput) {
    if (this.closed) {
      return;
    }
    if (this.events.length >= 128) {
      this.events.shift();
    }
    this.events.push({
      ...event,
      sequence: this.sequence,
      timestamp: Date.now(),
    });
    this.sequence += 1;
    this.timer ??= setTimeout(() => {
      void this.flush();
    }, 2000);
  }

  private async flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.sending) {
      return;
    }
    this.sending = true;
    try {
      while (this.events.length) {
        const events: PracticeTraceEvent[] = [];
        // Leave room for UTF-8 encoding and the capability within keepalive's
        // 64 KiB budget and the backend's 60 KB request limit.
        while (this.events.length && events.length < 8) {
          const [next] = this.events;
          if (
            !next ||
            new TextEncoder().encode(JSON.stringify([...events, next])).length >
              48_000
          ) {
            break;
          }
          events.push(next);
          this.events.shift();
        }
        if (!events.length) {
          this.events.shift();
          continue;
        }
        // Preserve ordering and stay within the shared keepalive byte budget.
        // oxlint-disable-next-line no-await-in-loop
        await fetch(`${apiUrl}/api/practice/trace-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracingToken: this.token, events }),
          keepalive: true,
          signal: AbortSignal.timeout(5000),
        }).catch(() => {
          // Tracing loss must not interrupt the voice session.
        });
      }
    } finally {
      this.sending = false;
    }
  }

  close() {
    this.closed = true;
    void this.flush();
  }
}
