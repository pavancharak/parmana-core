import type { Pool } from "pg";

import type {
  RefusalRecordOutboxEntry,
  RefusalRecordOutboxRepository,
} from "@parmana/shared";

/**
 * Postgres-backed refusal outbox (RFC-0021). See the migration
 * 20261123120000_add_refusal_record_outbox.sql for why it exists.
 *
 * enqueue keeps the first entry for a transaction, so a repeated refusal
 * attempt cannot overwrite the inputs of an earlier, undelivered one.
 */
export class PostgresRefusalRecordOutboxRepository implements RefusalRecordOutboxRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(entry: RefusalRecordOutboxEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO refusal_record_outbox (
         business_transaction_id, decision_json, evaluated_intent_json,
         binding_violations_json, submitted_by, policy_content_hash,
         enqueued_at, attempts, last_error
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (business_transaction_id) DO NOTHING`,
      [
        entry.businessTransactionId,
        JSON.stringify(entry.decision),
        JSON.stringify(entry.evaluatedIntent),
        entry.bindingViolations
          ? JSON.stringify(entry.bindingViolations)
          : null,
        entry.submittedBy ?? null,
        entry.policyContentHash ?? null,
        entry.enqueuedAt.toISOString(),
        entry.attempts,
        entry.lastError ?? null,
      ],
    );
  }

  async listPending(limit: number): Promise<RefusalRecordOutboxEntry[]> {
    const result = await this.pool.query(
      `SELECT business_transaction_id, decision_json, evaluated_intent_json,
              binding_violations_json, submitted_by, policy_content_hash,
              enqueued_at, attempts, last_error
         FROM refusal_record_outbox
        WHERE delivered_at IS NULL
        ORDER BY enqueued_at
        LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
      businessTransactionId: row.business_transaction_id,
      decision: row.decision_json,
      evaluatedIntent: row.evaluated_intent_json,
      ...(row.binding_violations_json
        ? { bindingViolations: row.binding_violations_json }
        : {}),
      ...(row.submitted_by ? { submittedBy: row.submitted_by } : {}),
      ...(row.policy_content_hash
        ? { policyContentHash: row.policy_content_hash }
        : {}),
      enqueuedAt: new Date(row.enqueued_at),
      attempts: Number(row.attempts),
      ...(row.last_error ? { lastError: row.last_error } : {}),
    }));
  }

  async markDelivered(businessTransactionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refusal_record_outbox
          SET delivered_at = now()
        WHERE business_transaction_id = $1`,
      [businessTransactionId],
    );
  }

  async recordFailure(
    businessTransactionId: string,
    error: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE refusal_record_outbox
          SET attempts = attempts + 1, last_error = $2
        WHERE business_transaction_id = $1`,
      [businessTransactionId, error],
    );
  }
}
