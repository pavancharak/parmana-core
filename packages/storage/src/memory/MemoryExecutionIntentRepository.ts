import type {
  ExecutionIntent,
  ExecutionIntentFinalizationMode,
  ExecutionIntentRepository,
  ExecutionIntentResolutionInput,
  StoredExecutionIntent,
} from "@parmana/shared";

/**
 * In-memory ExecutionIntentRepository (ADR-0012), for tests and local
 * development. Applies the same state transition rules as the Postgres
 * implementation: markReleased and markErrored only move a PREPARED intent,
 * and markFinalized never moves a FINALIZED one.
 */
export class MemoryExecutionIntentRepository implements ExecutionIntentRepository {
  private readonly intents = new Map<string, StoredExecutionIntent>();

  async create(intent: ExecutionIntent): Promise<ExecutionIntent> {
    if (this.intents.has(intent.businessTransactionId)) {
      throw new Error(
        `An Execution Intent already exists for '${intent.businessTransactionId}'.`,
      );
    }

    this.intents.set(intent.businessTransactionId, {
      intent,
      status: { state: "PREPARED" },
    });

    return intent;
  }

  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<StoredExecutionIntent | null> {
    return this.intents.get(businessTransactionId) ?? null;
  }

  async markReleased(
    businessTransactionId: string,
    releasedContext: unknown,
    releasedAt: Date,
  ): Promise<void> {
    const stored = this.intents.get(businessTransactionId);

    if (!stored || stored.status.state !== "PREPARED") {
      return;
    }

    this.intents.set(businessTransactionId, {
      intent: stored.intent,
      status: { state: "RELEASED", releasedAt },
      releasedContext,
    });
  }

  async markFinalized(
    businessTransactionId: string,
    trustRecordId: string,
    mode: ExecutionIntentFinalizationMode,
    finalizedAt: Date,
  ): Promise<void> {
    const stored = this.intents.get(businessTransactionId);

    if (!stored || stored.status.state === "FINALIZED") {
      return;
    }

    // The saved release context is dropped: once the Trust Record exists it has
    // no further use, and it holds the full execution context.
    this.intents.set(businessTransactionId, {
      intent: stored.intent,
      status: {
        ...stored.status,
        state: "FINALIZED",
        trustRecordId,
        finalizationMode: mode,
        finalizedAt,
      },
    });
  }

  async markErrored(
    businessTransactionId: string,
    reason: string,
  ): Promise<void> {
    const stored = this.intents.get(businessTransactionId);

    if (!stored || stored.status.state !== "PREPARED") {
      return;
    }

    this.intents.set(businessTransactionId, {
      ...stored,
      status: { state: "ERRORED", failureReason: reason },
    });
  }

  async markResolved(
    businessTransactionId: string,
    input: ExecutionIntentResolutionInput,
  ): Promise<boolean> {
    const stored = this.intents.get(businessTransactionId);

    if (
      !stored ||
      (stored.status.state !== "PREPARED" && stored.status.state !== "ERRORED")
    ) {
      return false;
    }

    this.intents.set(businessTransactionId, {
      intent: stored.intent,
      status: {
        ...stored.status,
        state: "RESOLVED",
        resolution: input.resolution,
        resolutionNote: input.note,
        ...(input.resolvedBy !== undefined && { resolvedBy: input.resolvedBy }),
        resolvedAt: input.resolvedAt,
      },
    });

    return true;
  }

  async listUnfinalized(
    limit: number,
  ): Promise<readonly StoredExecutionIntent[]> {
    return [...this.intents.values()]
      .filter(
        (stored) =>
          stored.status.state !== "FINALIZED" &&
          stored.status.state !== "RESOLVED",
      )
      .sort(
        (a, b) => a.intent.createdAt.getTime() - b.intent.createdAt.getTime(),
      )
      .slice(0, limit);
  }
}
