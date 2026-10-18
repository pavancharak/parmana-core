import type { Pool } from "pg";

import {
  applyPendingPolicyChangeResolution,
  ConflictError,
  PendingPolicyChangeNotFoundError,
  PendingPolicyChangeStatus,
  type JsonValue,
  type PendingPolicyChange,
  type PendingPolicyChangeRepository,
  type PendingPolicyChangeResolution,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Postgres-backed implementation of PendingPolicyChangeRepository
 * (Policy Governance, maker-checker).
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST -- same reasoning as every other Supabase
 * repository in this package.
 *
 * The "exactly one PENDING_APPROVAL per (policyName, policyVersion)"
 * invariant is enforced twice: `assertNoConflictingPendingChange`
 * (application-level, shared with MemoryPendingPolicyChangeRepository)
 * runs first for a fast, clear rejection in the common case, and the
 * partial unique index `ux_pending_policy_changes_open` (migration
 * 20260818120000) makes it atomic at the database for the concurrent
 * case two proposals race past the application check simultaneously
 * -- the same two-layer discipline G-1 established for duplicate
 * Business Transactions.
 */
export class SupabasePendingPolicyChangeRepository implements PendingPolicyChangeRepository {
  constructor(private readonly pool: Pool) {}

  async create(change: PendingPolicyChange): Promise<PendingPolicyChange> {
    try {
      await this.pool.query(INSERT_PENDING_POLICY_CHANGE_SQL, [
        change.pendingPolicyChangeId,
        change.policyName,
        change.policyVersion,
        JSON.stringify(change.proposedContent),
        change.proposedBy,
        change.proposedAt.toISOString(),
        change.status,
        change.reason,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          `A PENDING_APPROVAL change already exists for policy '${change.policyName}' ` +
            `version '${change.policyVersion}'. It must be approved or rejected before a ` +
            "new proposal against the same policy version can be created.",
        );
      }

      throw error;
    }

    return change;
  }

  async findById(
    pendingPolicyChangeId: string,
  ): Promise<PendingPolicyChange | null> {
    const { rows } = await this.pool.query(SELECT_BY_ID_SQL, [
      pendingPolicyChangeId,
    ]);

    return rows[0]
      ? toPendingPolicyChange(rows[0] as PendingPolicyChangeRow)
      : null;
  }

  async findPending(
    policyName: string,
    policyVersion: string,
  ): Promise<PendingPolicyChange | null> {
    const { rows } = await this.pool.query(SELECT_PENDING_SQL, [
      policyName,
      policyVersion,
    ]);

    return rows[0]
      ? toPendingPolicyChange(rows[0] as PendingPolicyChangeRow)
      : null;
  }

  async list(
    status?: PendingPolicyChangeStatus,
  ): Promise<readonly PendingPolicyChange[]> {
    const { rows } =
      status === undefined
        ? await this.pool.query(SELECT_ALL_SQL)
        : await this.pool.query(SELECT_BY_STATUS_SQL, [status]);

    return (rows as PendingPolicyChangeRow[]).map(toPendingPolicyChange);
  }

  /**
   * Read-transform-write with a status-guarded UPDATE: the pure
   * `applyPendingPolicyChangeResolution` (shared with the in-memory
   * backend) rejects an already-resolved change from the row this
   * method reads, and the `WHERE status = 'PENDING_APPROVAL'` clause
   * below closes the remaining race -- a concurrent resolve landing
   * between this method's SELECT and UPDATE updates zero rows, which
   * is surfaced as the same ConflictError the pure function itself
   * throws for the non-concurrent case.
   */
  async resolve(
    pendingPolicyChangeId: string,
    resolution: PendingPolicyChangeResolution,
  ): Promise<PendingPolicyChange> {
    const existing = await this.findById(pendingPolicyChangeId);

    if (!existing) {
      throw new PendingPolicyChangeNotFoundError(pendingPolicyChangeId);
    }

    const updated = applyPendingPolicyChangeResolution(
      existing,
      resolution,
      new Date(),
    );

    const { rowCount } = await this.pool.query(UPDATE_RESOLVE_SQL, [
      pendingPolicyChangeId,
      updated.status,
      updated.resolvedBy,
      updated.resolvedAt?.toISOString(),
      updated.rejectionReason ?? null,
    ]);

    if (rowCount === 0) {
      throw new ConflictError(
        `Pending Policy Change '${pendingPolicyChangeId}' was resolved concurrently by ` +
          "another request -- only a PENDING_APPROVAL change can be approved or rejected.",
      );
    }

    return updated;
  }
}

const INSERT_PENDING_POLICY_CHANGE_SQL = `
  INSERT INTO pending_policy_changes
    (pending_policy_change_id, policy_name, policy_version, proposed_content_json,
     proposed_by, proposed_at, status, reason)
  VALUES
    ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
`;

const SELECT_BY_ID_SQL = `
  SELECT * FROM pending_policy_changes WHERE pending_policy_change_id = $1
`;

const SELECT_PENDING_SQL = `
  SELECT * FROM pending_policy_changes
  WHERE policy_name = $1 AND policy_version = $2 AND status = 'PENDING_APPROVAL'
`;

const SELECT_ALL_SQL = `
  SELECT * FROM pending_policy_changes ORDER BY proposed_at DESC
`;

const SELECT_BY_STATUS_SQL = `
  SELECT * FROM pending_policy_changes WHERE status = $1 ORDER BY proposed_at DESC
`;

const UPDATE_RESOLVE_SQL = `
  UPDATE pending_policy_changes
  SET status = $2, resolved_by = $3, resolved_at = $4, rejection_reason = $5
  WHERE pending_policy_change_id = $1 AND status = 'PENDING_APPROVAL'
`;

interface PendingPolicyChangeRow {
  readonly pending_policy_change_id: string;
  readonly policy_name: string;
  readonly policy_version: string;
  readonly proposed_content_json: JsonValue;
  readonly proposed_by: string;
  readonly proposed_at: string | Date;
  readonly status: PendingPolicyChangeStatus;
  readonly reason: string;
  readonly resolved_by: string | null;
  readonly resolved_at: string | Date | null;
  readonly rejection_reason: string | null;
}

function toPendingPolicyChange(
  row: PendingPolicyChangeRow,
): PendingPolicyChange {
  return {
    pendingPolicyChangeId: row.pending_policy_change_id,
    policyName: row.policy_name,
    policyVersion: row.policy_version,
    proposedContent: row.proposed_content_json,
    proposedBy: row.proposed_by,
    proposedAt: new Date(row.proposed_at),
    status: row.status,
    reason: row.reason,

    ...(row.resolved_by !== null ? { resolvedBy: row.resolved_by } : {}),
    ...(row.resolved_at !== null
      ? { resolvedAt: new Date(row.resolved_at) }
      : {}),
    ...(row.rejection_reason !== null
      ? { rejectionReason: row.rejection_reason }
      : {}),
  };
}
