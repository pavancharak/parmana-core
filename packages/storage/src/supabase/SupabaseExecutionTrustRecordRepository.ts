import type {
  Execution,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  Override,
  Receipt,
  Verification,
} from "@parmana/shared";

import type { Pool } from "pg";

/**
 * Postgres-backed implementation of ExecutionTrustRecordRepository.
 *
 * Stores the immutable Trust Record header in
 * execution_trust_records and stores runtime
 * artifacts in their respective tables.
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST -- part of removing PostgREST from every
 * Supabase-backed table's failure modes, not just the audit sinks
 * that broke first (see SupabaseCallerAuditSink for the originating
 * incident). ORDER BY <timestamp> ASC, seq ASC on every sub-collection
 * select reproduces exactly the ordering fix already proven by
 * packages/storage/tests/integration/
 * supabase-execution-trust-record-ordering.integration.test.ts -- seq
 * is a BIGSERIAL populated by Postgres itself on insert
 * (supabase/migrations/20260711120000_add_trust_record_sequence_columns.sql),
 * so this class never assigns it explicitly, only reads it back.
 *
 * authorization_json/schema_version/signatures_json (added by
 * 20260907120000_add_authorization_and_hybrid_signatures_to_execution_trust_records.sql)
 * are all nullable and written/read alongside the rest of the header --
 * schema_version/signatures_json close a gap where a CRYPTO_MODE=hybrid
 * record's second signature was silently dropped on every round trip
 * through this repository (no column ever existed for it), degrading
 * hybrid verification to single-signature for anything reloaded from
 * Supabase.
 */
export class SupabaseExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Creates the Trust Record header.
   */
  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    await this.pool.query(INSERT_TRUST_RECORD_SQL, [
      record.trustRecordId,
      record.businessTransactionId,
      JSON.stringify(record.transaction),
      record.trustRecordHash,
      JSON.stringify(record.signature),
      record.createdAt.toISOString(),
      record.updatedAt.toISOString(),
      record.authorization !== undefined
        ? JSON.stringify(record.authorization)
        : null,
      record.schemaVersion ?? null,
      record.signatures !== undefined
        ? JSON.stringify(record.signatures)
        : null,
    ]);

    return record;
  }

  /**
   * Loads the complete Trust Record aggregate.
   */
  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord | null> {
    const { rows: headerRows } = await this.pool.query(SELECT_HEADER_SQL, [
      businessTransactionId,
    ]);

    const header = headerRows[0] as TrustRecordHeaderRow | undefined;

    if (!header) {
      return null;
    }

    const [executionRows, overrideRows, verificationRows, receiptRows] =
      await Promise.all([
        this.pool.query(SELECT_EXECUTIONS_SQL, [businessTransactionId]),
        this.pool.query(SELECT_OVERRIDES_SQL, [businessTransactionId]),
        this.pool.query(SELECT_VERIFICATIONS_SQL, [businessTransactionId]),
        this.pool.query(SELECT_RECEIPTS_SQL, [businessTransactionId]),
      ]);

    return {
      trustRecordId: header.trust_record_id,
      businessTransactionId: header.business_transaction_id,
      transaction: header.transaction_json,

      executions: (executionRows.rows as { execution_json: Execution }[]).map(
        (row) => row.execution_json,
      ),

      overrides: (overrideRows.rows as { override_json: Override }[]).map(
        (row) => row.override_json,
      ),

      verifications: (
        verificationRows.rows as { verification_json: Verification }[]
      ).map((row) => row.verification_json),

      receipts: (receiptRows.rows as { receipt_json: Receipt }[]).map(
        (row) => row.receipt_json,
      ),

      trustRecordHash: header.trust_record_hash,
      signature: header.signature_json,
      ...(header.authorization_json != null
        ? { authorization: header.authorization_json }
        : {}),
      ...(header.schema_version != null
        ? { schemaVersion: header.schema_version }
        : {}),
      ...(header.signatures_json != null
        ? { signatures: header.signatures_json }
        : {}),
      createdAt: new Date(header.created_at),
      updatedAt: new Date(header.updated_at),
    };
  }

  /**
   * Appends an Execution.
   */
  async appendExecution(
    businessTransactionId: string,
    execution: Execution,
  ): Promise<void> {
    await this.pool.query(INSERT_EXECUTION_SQL, [
      execution.executionId,
      businessTransactionId,
      JSON.stringify(execution),
      execution.startedAt.toISOString(),
    ]);

    await this.touch(businessTransactionId);
  }

  /**
   * Replaces an immutable Execution snapshot.
   *
   * @deprecated
   */
  async replaceExecution(execution: Execution): Promise<void> {
    await this.pool.query(UPDATE_EXECUTION_SQL, [
      JSON.stringify(execution),
      execution.executionId,
    ]);

    await this.touch(execution.businessTransactionId);
  }

  /**
   * Appends an Override.
   */
  async appendOverride(
    businessTransactionId: string,
    override: Override,
  ): Promise<void> {
    await this.pool.query(INSERT_OVERRIDE_SQL, [
      override.overrideId,
      businessTransactionId,
      JSON.stringify(override),
      override.approvedAt.toISOString(),
    ]);

    await this.touch(businessTransactionId);
  }

  /**
   * Appends a Verification.
   */
  async appendVerification(
    businessTransactionId: string,
    verification: Verification,
  ): Promise<void> {
    await this.pool.query(INSERT_VERIFICATION_SQL, [
      verification.verificationId,
      businessTransactionId,
      JSON.stringify(verification),
      verification.verifiedAt.toISOString(),
    ]);

    await this.touch(businessTransactionId);
  }

  /**
   * Appends a Receipt.
   */
  async appendReceipt(
    businessTransactionId: string,
    receipt: Receipt,
  ): Promise<void> {
    await this.pool.query(INSERT_RECEIPT_SQL, [
      receipt.receiptId,
      businessTransactionId,
      JSON.stringify(receipt),
      receipt.issuedAt.toISOString(),
    ]);

    await this.touch(businessTransactionId);
  }

  /**
   * Updates the Trust Record timestamp.
   */
  private async touch(businessTransactionId: string): Promise<void> {
    await this.pool.query(TOUCH_TRUST_RECORD_SQL, [
      new Date().toISOString(),
      businessTransactionId,
    ]);
  }

  /**
   * Sums evidence.parameters[parameterKey] across every successfully
   * executed (status COMPLETED, evidence.success true) execution whose
   * evidence.action matches, within [since, until) -- reading only the
   * existing executions table's JSONB column, no new table (TD-23
   * closure, Phase 3B).
   */
  async sumSuccessfulExecutionAmounts(
    action: string,
    parameterKey: string,
    since: Date,
    until: Date,
  ): Promise<number> {
    const { rows } = await this.pool.query<{ total: string | null }>(
      SUM_SUCCESSFUL_EXECUTION_AMOUNTS_SQL,
      [action, parameterKey, since.toISOString(), until.toISOString()],
    );

    return Number(rows[0]?.total ?? 0);
  }
}

const INSERT_TRUST_RECORD_SQL = `
  INSERT INTO execution_trust_records
    (trust_record_id, business_transaction_id, transaction_json,
     trust_record_hash, signature_json, created_at, updated_at,
     authorization_json, schema_version, signatures_json)
  VALUES
    ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10::jsonb)
`;

const SELECT_HEADER_SQL = `
  SELECT * FROM execution_trust_records WHERE business_transaction_id = $1
`;

const SELECT_EXECUTIONS_SQL = `
  SELECT execution_json FROM executions
  WHERE business_transaction_id = $1
  ORDER BY created_at ASC, seq ASC
`;

const SELECT_OVERRIDES_SQL = `
  SELECT override_json FROM overrides
  WHERE business_transaction_id = $1
  ORDER BY created_at ASC, seq ASC
`;

const SELECT_VERIFICATIONS_SQL = `
  SELECT verification_json FROM verifications
  WHERE business_transaction_id = $1
  ORDER BY verified_at ASC, seq ASC
`;

const SELECT_RECEIPTS_SQL = `
  SELECT receipt_json FROM receipts
  WHERE business_transaction_id = $1
  ORDER BY issued_at ASC, seq ASC
`;

const INSERT_EXECUTION_SQL = `
  INSERT INTO executions (execution_id, business_transaction_id, execution_json, created_at)
  VALUES ($1, $2, $3::jsonb, $4)
`;

const UPDATE_EXECUTION_SQL = `
  UPDATE executions SET execution_json = $1::jsonb WHERE execution_id = $2
`;

const INSERT_OVERRIDE_SQL = `
  INSERT INTO overrides (override_id, business_transaction_id, override_json, created_at)
  VALUES ($1, $2, $3::jsonb, $4)
`;

const INSERT_VERIFICATION_SQL = `
  INSERT INTO verifications (verification_id, business_transaction_id, verification_json, verified_at)
  VALUES ($1, $2, $3::jsonb, $4)
`;

const INSERT_RECEIPT_SQL = `
  INSERT INTO receipts (receipt_id, business_transaction_id, receipt_json, issued_at)
  VALUES ($1, $2, $3::jsonb, $4)
`;

const TOUCH_TRUST_RECORD_SQL = `
  UPDATE execution_trust_records SET updated_at = $1 WHERE business_transaction_id = $2
`;

const SUM_SUCCESSFUL_EXECUTION_AMOUNTS_SQL = `
  SELECT SUM((execution_json->'evidence'->'parameters'->>$2)::numeric) AS total
  FROM executions
  WHERE execution_json->>'status' = 'COMPLETED'
    AND (execution_json->'evidence'->>'success')::boolean = true
    AND execution_json->'evidence'->>'action' = $1
    AND (execution_json->'evidence'->>'executedAt')::timestamptz >= $3::timestamptz
    AND (execution_json->'evidence'->>'executedAt')::timestamptz < $4::timestamptz
`;

interface TrustRecordHeaderRow {
  readonly trust_record_id: string;
  readonly business_transaction_id: string;
  readonly transaction_json: ExecutionTrustRecord["transaction"];
  readonly trust_record_hash: string;
  readonly signature_json: ExecutionTrustRecord["signature"];
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
  readonly authorization_json?: ExecutionTrustRecord["authorization"] | null;
  readonly schema_version?: number | null;
  readonly signatures_json?: ExecutionTrustRecord["signatures"] | null;
}
