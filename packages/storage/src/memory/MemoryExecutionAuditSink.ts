import type { ExecutionAuditEvent, ExecutionAuditSink } from "@parmana/shared";

/**
 * Process-local ExecutionAuditSink for the memory storage provider and for
 * tests. Events are lost on restart. Production uses
 * PostgresExecutionAuditSink (ADR-0021, step 3).
 */
export class MemoryExecutionAuditSink implements ExecutionAuditSink {
  private readonly recorded: ExecutionAuditEvent[] = [];

  get events(): readonly ExecutionAuditEvent[] {
    return this.recorded.map((event) => Object.freeze({ ...event }));
  }

  async record(event: ExecutionAuditEvent): Promise<void> {
    this.recorded.push(Object.freeze({ ...event }));
  }
}
