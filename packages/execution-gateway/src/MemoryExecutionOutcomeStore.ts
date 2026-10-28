import {
  reviveExecutionResult,
  type ExecutionOutcome,
  type ExecutionOutcomeStore,
  type ExecutionResult,
} from "@parmana/shared";

interface Row {
  readonly status: "in_flight" | "completed";
  readonly resultJson?: string;
}

/**
 * In-process ExecutionOutcomeStore for tests. Loses all state on restart,
 * like MemoryNonceStore. Production uses SupabaseExecutionOutcomeStore.
 *
 * Results are stored as JSON, as the durable store stores them, so tests see
 * the same round trip production does (for example, executedAt becomes a Date
 * again).
 */
export class MemoryExecutionOutcomeStore implements ExecutionOutcomeStore {
  private readonly rows = new Map<string, Row>();

  async begin(nonce: string): Promise<boolean> {
    if (this.rows.has(nonce)) {
      return false;
    }

    this.rows.set(nonce, { status: "in_flight" });

    return true;
  }

  async complete(nonce: string, result: ExecutionResult): Promise<void> {
    const row = this.rows.get(nonce);

    if (row?.status !== "in_flight") {
      throw new Error(
        `No in-flight execution outcome recorded for nonce '${nonce}'.`,
      );
    }

    this.rows.set(nonce, {
      status: "completed",
      resultJson: JSON.stringify(result),
    });
  }

  async get(nonce: string): Promise<ExecutionOutcome | undefined> {
    const row = this.rows.get(nonce);

    if (row === undefined) {
      return undefined;
    }

    if (row.status === "in_flight") {
      return { status: "in_flight" };
    }

    return {
      status: "completed",
      result: reviveExecutionResult(JSON.parse(row.resultJson ?? "null")),
    };
  }
}
