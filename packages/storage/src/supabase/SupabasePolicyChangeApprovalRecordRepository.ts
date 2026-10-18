import type { Pool } from "pg";

import {
  ConflictError,
  type PolicyChangeApprovalRecord,
  type PolicyChangeApprovalRecordRepository,
  type Signature,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Postgres-backed implementation of PolicyChangeApprovalRecordRepository
 * (Policy Governance, maker-checker).
 *
 * A single insert, no update path -- same append-only shape as
 * SupabaseRefusalRecordRepository. Writes via a direct Postgres
 * connection (PostgresPoolFactory), not supabase-js/PostgREST.
 */
export class SupabasePolicyChangeApprovalRecordRepository implements PolicyChangeApprovalRecordRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * The unique index on pending_policy_change_id
   * (20261003120000_unique_policy_change_approval_per_pending_change.sql,
   * covering records approved from 2026-10-03 18:18:37 UTC)
   * makes a second record for the same pending change fail atomically
   * at the database. Mapped to ConflictError (409), the same error the
   * in-memory repository throws, so a concurrent second approval stops
   * before PolicyChangeApprovalService writes the live policy.
   */
  async create(
    record: PolicyChangeApprovalRecord,
  ): Promise<PolicyChangeApprovalRecord> {
    try {
      await this.insert(record);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw duplicateApprovalError(record.pendingPolicyChangeId);
      }

      throw error;
    }

    return record;
  }

  private async insert(record: PolicyChangeApprovalRecord): Promise<void> {
    await this.pool.query(INSERT_APPROVAL_RECORD_SQL, [
      record.policyChangeApprovalRecordId,
      record.pendingPolicyChangeId,
      record.policyName,
      record.policyVersion,
      record.proposedBy,
      record.approvedBy,
      record.proposedAt.toISOString(),
      record.approvedAt.toISOString(),
      record.contentHashBefore ?? null,
      record.contentHashAfter,
      JSON.stringify(record.signature),
      record.previousRecordHash ?? null,
    ]);
  }

  async findById(
    policyChangeApprovalRecordId: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    const { rows } = await this.pool.query(SELECT_BY_ID_SQL, [
      policyChangeApprovalRecordId,
    ]);

    const row = rows[0] as PolicyChangeApprovalRecordRow | undefined;

    return row ? toPolicyChangeApprovalRecord(row) : null;
  }

  async findByPendingPolicyChangeId(
    pendingPolicyChangeId: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    const { rows } = await this.pool.query(SELECT_BY_PENDING_CHANGE_SQL, [
      pendingPolicyChangeId,
    ]);

    const row = rows[0] as PolicyChangeApprovalRecordRow | undefined;

    return row ? toPolicyChangeApprovalRecord(row) : null;
  }

  async list(): Promise<readonly PolicyChangeApprovalRecord[]> {
    const { rows } = await this.pool.query(SELECT_ALL_SQL);

    return (rows as PolicyChangeApprovalRecordRow[]).map(
      toPolicyChangeApprovalRecord,
    );
  }

  /**
   * The most recent approval record for a given (policyName,
   * policyVersion) -- what PolicyIntegrityChecker compares the live
   * policies/{name}/{version}/policy.json against at startup/deploy
   * time.
   */
  async findMostRecentFor(
    policyName: string,
    policyVersion: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    const { rows } = await this.pool.query(SELECT_MOST_RECENT_FOR_SQL, [
      policyName,
      policyVersion,
    ]);

    const row = rows[0] as PolicyChangeApprovalRecordRow | undefined;

    return row ? toPolicyChangeApprovalRecord(row) : null;
  }

  /**
   * The most recent approval record for a policy name, across all its
   * versions: the version currently in effect (G-66).
   */
  async findMostRecentForName(
    policyName: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    const { rows } = await this.pool.query(SELECT_MOST_RECENT_FOR_NAME_SQL, [
      policyName,
    ]);

    const row = rows[0] as PolicyChangeApprovalRecordRow | undefined;

    return row ? toPolicyChangeApprovalRecord(row) : null;
  }
}

function duplicateApprovalError(pendingPolicyChangeId: string): ConflictError {
  return new ConflictError(
    `Pending Policy Change '${pendingPolicyChangeId}' already has an ` +
      "approval record -- it was approved concurrently or already resolved.",
  );
}

const INSERT_APPROVAL_RECORD_SQL = `
  INSERT INTO policy_change_approval_records
    (policy_change_approval_record_id, pending_policy_change_id, policy_name, policy_version,
     proposed_by, approved_by, proposed_at, approved_at, content_hash_before,
     content_hash_after, signature_json, previous_record_hash)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
`;

const SELECT_BY_ID_SQL = `
  SELECT * FROM policy_change_approval_records WHERE policy_change_approval_record_id = $1
`;

const SELECT_BY_PENDING_CHANGE_SQL = `
  SELECT * FROM policy_change_approval_records
  WHERE pending_policy_change_id = $1
  ORDER BY approved_at DESC, policy_change_approval_record_id DESC
  LIMIT 1
`;

const SELECT_ALL_SQL = `
  SELECT * FROM policy_change_approval_records ORDER BY approved_at DESC
`;

const SELECT_MOST_RECENT_FOR_NAME_SQL = `
  SELECT * FROM policy_change_approval_records
  WHERE policy_name = $1
  ORDER BY approved_at DESC, policy_change_approval_record_id DESC
  LIMIT 1
`;

const SELECT_MOST_RECENT_FOR_SQL = `
  SELECT * FROM policy_change_approval_records
  WHERE policy_name = $1 AND policy_version = $2
  ORDER BY approved_at DESC
  LIMIT 1
`;

interface PolicyChangeApprovalRecordRow {
  readonly policy_change_approval_record_id: string;
  readonly pending_policy_change_id: string;
  readonly policy_name: string;
  readonly policy_version: string;
  readonly proposed_by: string;
  readonly approved_by: string;
  readonly proposed_at: string | Date;
  readonly approved_at: string | Date;
  readonly content_hash_before: string | null;
  readonly content_hash_after: string;
  readonly signature_json: Signature;
  readonly previous_record_hash: string | null;
}

function toPolicyChangeApprovalRecord(
  row: PolicyChangeApprovalRecordRow,
): PolicyChangeApprovalRecord {
  return {
    policyChangeApprovalRecordId: row.policy_change_approval_record_id,
    pendingPolicyChangeId: row.pending_policy_change_id,
    policyName: row.policy_name,
    policyVersion: row.policy_version,
    proposedBy: row.proposed_by,
    approvedBy: row.approved_by,
    proposedAt: new Date(row.proposed_at),
    approvedAt: new Date(row.approved_at),

    ...(row.content_hash_before !== null
      ? { contentHashBefore: row.content_hash_before }
      : {}),

    contentHashAfter: row.content_hash_after,

    ...(row.previous_record_hash != null
      ? { previousRecordHash: row.previous_record_hash }
      : {}),

    signature: row.signature_json,
  };
}
