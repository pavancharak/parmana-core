import type { CallerAuditEvent, CallerAuditSink } from "./CallerAuditSink.js";

export class InMemoryCallerAuditSink implements CallerAuditSink {
  private readonly _events: CallerAuditEvent[] = [];

  async record(event: CallerAuditEvent): Promise<void> {
    this._events.push(event);
  }

  get events(): readonly CallerAuditEvent[] {
    return this._events;
  }
}
