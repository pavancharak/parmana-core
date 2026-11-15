import {
  BusinessTransactionNotFoundError,
  InvalidStatusTransitionError,
  isAllowedTransition,
  type AppendTransactionStatusEvent,
  type TransactionStatus,
  type TransactionStatusEvent,
  type TransactionStatusEventRepository,
  type TransactionStatusStage,
} from "@parmana/shared";

import type { Pool, PoolClient } from "pg";

interface EventRow {
  event_id: string;
  business_transaction_id: string;
  sequence: string | number;
  status: TransactionStatus;
  stage: TransactionStatusStage;
  occurred_at: Date;
  record_ref: string | null;
  reason: string | null;
  legacy: boolean;
}

function toEvent(row: EventRow): TransactionStatusEvent {
  return {
    eventId: row.event_id,
    businessTransactionId: row.business_transaction_id,
    sequence: Number(row.sequence),
    status: row.status,
    stage: row.stage,
    occurredAt: row.occurred_at,
    ...(row.record_ref !== null && { recordRef: row.record_ref }),
    ...(row.reason !== null && { reason: row.reason }),
    legacy: row.legacy,
  };
}

/**
 * Postgres implementation of TransactionStatusEventRepository (decision D23,
 * design section 3 and 5).
 *
 * `append` runs in one database transaction. It locks the business
 * transaction's row (`FOR UPDATE`), so two writers for the same transaction
 * queue behind each other. Under that lock it reads the current status, checks
 * it, assigns the next sequence and inserts the event. Any failure rolls the
 * whole step back.
 */
export class PostgresTransactionStatusEventRepository implements TransactionStatusEventRepository {
  constructor(private readonly pool: Pool) {}

  async append(
    input: AppendTransactionStatusEvent,
  ): Promise<TransactionStatusEvent> {
    const id = input.businessTransactionId;
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const locked = await client.query(
        `SELECT business_transaction_id FROM business_transactions
          WHERE business_transaction_id = $1 FOR UPDATE`,
        [id],
      );
      if (locked.rowCount === 0) {
        throw new BusinessTransactionNotFoundError(id);
      }

      const last = await client.query<{
        status: TransactionStatus;
        sequence: string;
      }>(
        `SELECT status, sequence FROM transaction_status_events
          WHERE business_transaction_id = $1
          ORDER BY sequence DESC LIMIT 1`,
        [id],
      );
      const current = last.rows[0]?.status ?? null;
      const nextSequence = last.rows[0] ? Number(last.rows[0].sequence) + 1 : 1;

      if (current !== input.from) {
        throw new InvalidStatusTransitionError(
          id,
          `current status is ${current ?? "none"}, expected ${input.from ?? "none"}`,
        );
      }
      if (!isAllowedTransition(current, input.to)) {
        throw new InvalidStatusTransitionError(
          id,
          `status cannot move from ${current ?? "none"} to ${input.to}`,
        );
      }

      const inserted = await client.query<EventRow>(
        `INSERT INTO transaction_status_events
           (event_id, business_transaction_id, sequence, status, stage,
            occurred_at, record_ref, reason, legacy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
         RETURNING event_id, business_transaction_id, sequence, status, stage,
                   occurred_at, record_ref, reason, legacy`,
        [
          input.eventId,
          id,
          nextSequence,
          input.to,
          input.stage,
          input.occurredAt,
          input.recordRef ?? null,
          input.reason ?? null,
        ],
      );

      await client.query("COMMIT");
      return toEvent(inserted.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async current(
    businessTransactionId: string,
  ): Promise<TransactionStatusEvent | null> {
    const result = await this.pool.query<EventRow>(
      `SELECT event_id, business_transaction_id, sequence, status, stage,
              occurred_at, record_ref, reason, legacy
         FROM transaction_status_events
        WHERE business_transaction_id = $1
        ORDER BY sequence DESC LIMIT 1`,
      [businessTransactionId],
    );
    return result.rows[0] ? toEvent(result.rows[0]) : null;
  }

  async history(
    businessTransactionId: string,
  ): Promise<readonly TransactionStatusEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT event_id, business_transaction_id, sequence, status, stage,
              occurred_at, record_ref, reason, legacy
         FROM transaction_status_events
        WHERE business_transaction_id = $1
        ORDER BY sequence ASC`,
      [businessTransactionId],
    );
    return result.rows.map(toEvent);
  }
}
