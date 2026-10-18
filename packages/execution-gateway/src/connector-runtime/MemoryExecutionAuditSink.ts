import type { ExecutionAuditEvent, ExecutionAuditSink } from "./types.js";

export class MemoryExecutionAuditSink implements ExecutionAuditSink {
  private readonly mutableEvents: ExecutionAuditEvent[] = [];

  get events(): readonly ExecutionAuditEvent[] {
    return this.mutableEvents;
  }

  async record(event: ExecutionAuditEvent): Promise<void> {
    this.mutableEvents.push(Object.freeze({ ...event }));
  }
}
