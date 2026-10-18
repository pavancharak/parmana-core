import type { ExecutionAuditEvent, ExecutionAuditSink } from "./types.js";

export class MemoryExecutionAuditSink implements ExecutionAuditSink {
  private readonly recorded: ExecutionAuditEvent[] = [];

  get events(): readonly ExecutionAuditEvent[] {
    return this.recorded.map((event) => Object.freeze({ ...event }));
  }

  async record(event: ExecutionAuditEvent): Promise<void> {
    this.recorded.push(Object.freeze({ ...event }));
  }
}
