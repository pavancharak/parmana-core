import type { Pool } from "pg";

import type { RefusalRecord, RefusalRecordRepository } from "@parmana/shared";

/**
 * Postgres-backed implementation of RefusalRecordRepository (RFC-0021).
 *
 * Unlike SupabaseExecutionTrustRecordRepository, there is no
 * append-only sub-history to assemble on read -- a Refusal Record is
 * a single row, one insert, one lookup.
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST -- part of removing PostgREST from every
 * Supabase-backed table's failure modes, not just the audit sinks
 * that broke first (see SupabaseCallerAuditSink for the originating
 * incident).
 */
export class SupabaseRefusalRecordRepository implements RefusalRecordRepository {
  constructor(private readonly pool: Pool) {}

  async create(record: RefusalRecord): Promise<RefusalRecord> {
    await this.pool.query(INSERT_REFUSAL_RECORD_SQL, [
      record.refusalRecordId,
      record.businessTransactionId,
      JSON.stringify(record.decision),
      JSON.stringify(record.evaluatedIntent),
      record.bindingViolations
        ? JSON.stringify(record.bindingViolations)
        : null,
      record.submittedBy ?? null,
      record.refusalRecordHash,
      JSON.stringify(record.signature),
      record.createdAt.toISOString(),
      record.policyContentHash ?? null,
    ]);

    return record;
  }

  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<RefusalRecord | null> {
    const { rows } = await this.pool.query(SELECT_BY_TRANSACTION_ID_SQL, [
      businessTransactionId,
    ]);

    const row = rows[0] as RefusalRecordRow | undefined;

    if (!row) {
      return null;
    }

    return {
      refusalRecordId: row.refusal_record_id,
      businessTransactionId: row.business_transaction_id,
      decision: row.decision_json,
      evaluatedIntent: row.evaluated_intent_json,

      ...(row.binding_violations_json
        ? { bindingViolations: row.binding_violations_json }
        : {}),
      ...(row.submitted_by !== null ? { submittedBy: row.submitted_by } : {}),
      ...(row.policy_content_hash !== null &&
      row.policy_content_hash !== undefined
        ? { policyContentHash: row.policy_content_hash }
        : {}),

      refusalRecordHash: row.refusal_record_hash,
      signature: row.signature_json,
      createdAt: new Date(row.created_at),
    };
  }
}

const INSERT_REFUSAL_RECORD_SQL = `
  INSERT INTO refusal_records
    (refusal_record_id, business_transaction_id, decision_json, evaluated_intent_json,
     binding_violations_json, submitted_by, refusal_record_hash, signature_json, created_at,
     policy_content_hash)
  VALUES
    ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb, $9, $10)
`;

const SELECT_BY_TRANSACTION_ID_SQL = `
  SELECT * FROM refusal_records WHERE business_transaction_id = $1
`;

interface RefusalRecordRow {
  readonly refusal_record_id: string;
  readonly business_transaction_id: string;
  readonly decision_json: RefusalRecord["decision"];
  readonly evaluated_intent_json: RefusalRecord["evaluatedIntent"];
  readonly binding_violations_json: RefusalRecord["bindingViolations"] | null;
  readonly submitted_by: string | null;
  readonly policy_content_hash?: string | null;
  readonly refusal_record_hash: string;
  readonly signature_json: RefusalRecord["signature"];
  readonly created_at: string | Date;
}
