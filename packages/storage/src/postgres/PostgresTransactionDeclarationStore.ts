import {
  DuplicateBusinessTransactionError,
  checkDeclarationEvent,
  type AppendTransactionStatusEvent,
  type BusinessTransaction,
  type TransactionDeclarationStore,
} from "@parmana/shared";

import type { Pool } from "pg";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";
import { insertBusinessTransactionRow } from "./PostgresBusinessTransactionRepository.js";

/**
 * Stores a declared transaction and its RECEIVED event in one database
 * transaction (decision D23, design section 3). If either insert fails, both
 * are rolled back, so a stored transaction always has a status.
 */
export class PostgresTransactionDeclarationStore implements TransactionDeclarationStore {
  constructor(private readonly pool: Pool) {}

  async declare(
    transaction: BusinessTransaction,
    firstEvent: AppendTransactionStatusEvent,
  ): Promise<void> {
    checkDeclarationEvent(transaction, firstEvent);

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await insertBusinessTransactionRow(client, transaction);

      await client.query(
        `INSERT INTO transaction_status_events
           (event_id, business_transaction_id, sequence, status, stage,
            occurred_at, record_ref, reason, legacy)
         VALUES ($1, $2, 1, 'RECEIVED', 'declare', $3, NULL, NULL, false)`,
        [
          firstEvent.eventId,
          firstEvent.businessTransactionId,
          firstEvent.occurredAt,
        ],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (isUniqueViolation(error)) {
        throw new DuplicateBusinessTransactionError(
          transaction.businessTransactionId,
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }
}
