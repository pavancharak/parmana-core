import type {
  RefusalRecordOutboxEntry,
  RefusalRecordOutboxRepository,
} from "@parmana/shared";

/**
 * In-memory refusal outbox (RFC-0021). Same contract as the Postgres
 * implementation. Used by tests and local runs without a database.
 */
export class MemoryRefusalRecordOutboxRepository implements RefusalRecordOutboxRepository {
  private readonly entries = new Map<string, RefusalRecordOutboxEntry>();
  private readonly delivered = new Set<string>();

  async enqueue(entry: RefusalRecordOutboxEntry): Promise<void> {
    if (!this.entries.has(entry.businessTransactionId)) {
      this.entries.set(entry.businessTransactionId, entry);
    }
  }

  async listPending(limit: number): Promise<RefusalRecordOutboxEntry[]> {
    return [...this.entries.values()]
      .filter((entry) => !this.delivered.has(entry.businessTransactionId))
      .sort((a, b) => a.enqueuedAt.getTime() - b.enqueuedAt.getTime())
      .slice(0, limit);
  }

  async markDelivered(businessTransactionId: string): Promise<void> {
    this.delivered.add(businessTransactionId);
  }

  async recordFailure(
    businessTransactionId: string,
    error: string,
  ): Promise<void> {
    const entry = this.entries.get(businessTransactionId);

    if (entry !== undefined) {
      this.entries.set(businessTransactionId, {
        ...entry,
        attempts: entry.attempts + 1,
        lastError: error,
      });
    }
  }
}
