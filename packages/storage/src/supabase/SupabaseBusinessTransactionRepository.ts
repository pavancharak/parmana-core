import {
  DuplicateBusinessTransactionError,
  type BusinessTransaction,
  type BusinessTransactionRepository,
} from "@parmana/shared";

import type { Pool } from "pg";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Postgres-backed implementation of BusinessTransactionRepository.
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST -- part of removing PostgREST from every
 * Supabase-backed table's failure modes, not just the audit sinks
 * that broke first (see SupabaseCallerAuditSink for the originating
 * incident).
 */
export class SupabaseBusinessTransactionRepository implements BusinessTransactionRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Persist immutable BusinessTransaction.
   *
   * Closes G-1 (docs/VERIFICATION-GAPS.md): this table's
   * `business_transaction_id TEXT PRIMARY KEY` constraint
   * (supabase/migrations/20260629013035_initial_schema.sql) already
   * made a duplicate insert atomic at the database — this method
   * maps the resulting 23505 unique_violation to the same
   * DuplicateBusinessTransactionError the in-memory repository
   * throws.
   */
  async create(transaction: BusinessTransaction): Promise<BusinessTransaction> {
    try {
      await this.pool.query(INSERT_BUSINESS_TRANSACTION_SQL, [
        transaction.businessTransactionId,
        transaction.status,
        JSON.stringify(transaction.authority),
        JSON.stringify(transaction.authorization),
        JSON.stringify(transaction.intent),
        JSON.stringify(transaction.metadata),
        JSON.stringify(transaction.policy),
        JSON.stringify(transaction.signals),
        transaction.createdAt.toISOString(),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateBusinessTransactionError(
          transaction.businessTransactionId,
        );
      }

      throw error;
    }

    return transaction;
  }

  /**
   * Find transaction by id.
   */
  async findById(
    businessTransactionId: string,
  ): Promise<BusinessTransaction | null> {
    const { rows } = await this.pool.query(SELECT_BY_ID_SQL, [
      businessTransactionId,
    ]);

    const row = rows[0] as BusinessTransactionRow | undefined;

    if (!row) {
      return null;
    }

    return rowToBusinessTransaction(row);
  }

  /**
   * True if transaction exists.
   */
  async exists(businessTransactionId: string): Promise<boolean> {
    const { rows } = await this.pool.query(EXISTS_SQL, [businessTransactionId]);

    return rows.length > 0;
  }

  /**
   * List transactions.
   */
  async list(
    page: number,
    pageSize: number,
  ): Promise<readonly BusinessTransaction[]> {
    const offset = (page - 1) * pageSize;

    const { rows } = await this.pool.query(LIST_SQL, [pageSize, offset]);

    return (rows as BusinessTransactionRow[]).map(rowToBusinessTransaction);
  }
}

const INSERT_BUSINESS_TRANSACTION_SQL = `
  INSERT INTO business_transactions
    (business_transaction_id, status, authority_json, authorization_json,
     intent_json, metadata_json, policy_json, signals_json, created_at)
  VALUES
    ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)
`;

const SELECT_BY_ID_SQL = `
  SELECT * FROM business_transactions WHERE business_transaction_id = $1
`;

const EXISTS_SQL = `
  SELECT 1 FROM business_transactions WHERE business_transaction_id = $1
`;

const LIST_SQL = `
  SELECT * FROM business_transactions
  ORDER BY created_at DESC
  LIMIT $1 OFFSET $2
`;

interface BusinessTransactionRow {
  readonly business_transaction_id: string;
  readonly status: BusinessTransaction["status"];
  readonly authority_json: BusinessTransaction["authority"];
  readonly authorization_json: BusinessTransaction["authorization"];
  readonly intent_json: BusinessTransaction["intent"];
  readonly metadata_json: BusinessTransaction["metadata"];
  readonly policy_json: BusinessTransaction["policy"];
  readonly signals_json: BusinessTransaction["signals"];
  readonly created_at: string | Date;
}

function rowToBusinessTransaction(
  row: BusinessTransactionRow,
): BusinessTransaction {
  return {
    businessTransactionId: row.business_transaction_id,
    status: row.status,
    authority: row.authority_json,
    authorization: row.authorization_json,
    intent: row.intent_json,
    metadata: row.metadata_json,
    policy: row.policy_json,
    signals: row.signals_json,
    createdAt: new Date(row.created_at),
  } as BusinessTransaction;
}
