import type { Pool, PoolClient } from "pg";

import {
  AuthorityGrantChangeNotFoundError,
  PendingPolicyChangeStatus,
  type AuthorityGrant,
  type AuthorityGrantChange,
  type AuthorityGrantChangeAction,
  type AuthorityGrantLimit,
  type AuthorityGrantRepository,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";
import {
  authorityGrantAlreadyActive,
  authorityGrantAlreadyResolved,
  authorityGrantNotActive,
  authorityGrantPendingConflict,
} from "../memory/MemoryAuthorityGrantRepository.js";

/**
 * Postgres backed AuthorityGrantRepository (migration
 * 20261011120000_add_authority_grants.sql), over a direct connection like
 * every other repository in this package.
 *
 * approveChange locks the change row, applies it to authority_grants, and
 * resolves it in one transaction, so a grant is never made or revoked
 * without an APPROVED change behind it, and two approvals of the same
 * change cannot both apply. "One pending change" and "one active grant"
 * per caller and capability are enforced by the partial unique indexes
 * ux_authority_grant_changes_open and ux_authority_grants_active.
 */
export class SupabaseAuthorityGrantRepository implements AuthorityGrantRepository {
  constructor(private readonly pool: Pool) {}

  async findActive(
    callerId: string,
    capability: string,
  ): Promise<AuthorityGrant | null> {
    const { rows } = await this.pool.query(SELECT_ACTIVE_SQL, [
      callerId,
      capability,
    ]);

    return rows[0] ? toGrant(rows[0] as GrantRow) : null;
  }

  async listGrants(): Promise<readonly AuthorityGrant[]> {
    const { rows } = await this.pool.query(SELECT_GRANTS_SQL);

    return (rows as GrantRow[]).map(toGrant);
  }

  async createChange(
    change: AuthorityGrantChange,
  ): Promise<AuthorityGrantChange> {
    try {
      await this.pool.query(INSERT_CHANGE_SQL, [
        change.changeId,
        change.action,
        change.callerId,
        change.capability,
        change.limits !== undefined ? JSON.stringify(change.limits) : null,
        change.validFrom?.toISOString() ?? null,
        change.validUntil?.toISOString() ?? null,
        change.reason,
        change.proposedBy,
        change.proposedAt.toISOString(),
        change.status,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw authorityGrantPendingConflict(change);
      }

      throw error;
    }

    return change;
  }

  async findChange(changeId: string): Promise<AuthorityGrantChange | null> {
    const { rows } = await this.pool.query(SELECT_CHANGE_SQL, [changeId]);

    return rows[0] ? toChange(rows[0] as ChangeRow) : null;
  }

  async listChanges(
    status?: AuthorityGrantChange["status"],
  ): Promise<readonly AuthorityGrantChange[]> {
    const { rows } =
      status === undefined
        ? await this.pool.query(SELECT_CHANGES_SQL)
        : await this.pool.query(SELECT_CHANGES_BY_STATUS_SQL, [status]);

    return (rows as ChangeRow[]).map(toChange);
  }

  async approveChange(
    changeId: string,
    approvedBy: string,
    at: Date,
  ): Promise<AuthorityGrantChange> {
    return this.inTransaction(async (client) => {
      const change = await lockPending(client, changeId);

      if (change.action === "grant") {
        try {
          await client.query(INSERT_GRANT_SQL, [
            change.changeId,
            change.callerId,
            change.capability,
            change.limits !== undefined ? JSON.stringify(change.limits) : null,
            (change.validFrom ?? at).toISOString(),
            change.validUntil?.toISOString() ?? null,
            at.toISOString(),
          ]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw authorityGrantAlreadyActive(change);
          }

          throw error;
        }
      } else {
        const { rowCount } = await client.query(REVOKE_GRANT_SQL, [
          change.callerId,
          change.capability,
          change.changeId,
          at.toISOString(),
        ]);

        if (rowCount === 0) {
          throw authorityGrantNotActive(change);
        }
      }

      await client.query(RESOLVE_CHANGE_SQL, [
        changeId,
        PendingPolicyChangeStatus.APPROVED,
        approvedBy,
        at.toISOString(),
        null,
      ]);

      return {
        ...change,
        status: PendingPolicyChangeStatus.APPROVED,
        resolvedBy: approvedBy,
        resolvedAt: at,
      };
    });
  }

  async rejectChange(
    changeId: string,
    rejectedBy: string,
    rejectionReason: string,
    at: Date,
  ): Promise<AuthorityGrantChange> {
    return this.inTransaction(async (client) => {
      const change = await lockPending(client, changeId);

      await client.query(RESOLVE_CHANGE_SQL, [
        changeId,
        PendingPolicyChangeStatus.REJECTED,
        rejectedBy,
        at.toISOString(),
        rejectionReason,
      ]);

      return {
        ...change,
        status: PendingPolicyChangeStatus.REJECTED,
        resolvedBy: rejectedBy,
        resolvedAt: at,
        rejectionReason,
      };
    });
  }

  private async inTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function lockPending(
  client: PoolClient,
  changeId: string,
): Promise<AuthorityGrantChange> {
  const { rows } = await client.query(LOCK_CHANGE_SQL, [changeId]);

  if (!rows[0]) {
    throw new AuthorityGrantChangeNotFoundError(changeId);
  }

  const change = toChange(rows[0] as ChangeRow);

  if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
    throw authorityGrantAlreadyResolved(change);
  }

  return change;
}

const SELECT_ACTIVE_SQL = `
  SELECT * FROM authority_grants
  WHERE caller_id = $1 AND capability = $2 AND status = 'active'
`;

const SELECT_GRANTS_SQL = `
  SELECT * FROM authority_grants ORDER BY granted_at, caller_id, capability
`;

const INSERT_GRANT_SQL = `
  INSERT INTO authority_grants
    (grant_id, caller_id, capability, limits, valid_from, valid_until,
     status, granted_at)
  VALUES
    ($1, $2, $3, $4, $5, $6, 'active', $7)
`;

const REVOKE_GRANT_SQL = `
  UPDATE authority_grants
  SET status = 'revoked', revoked_by_change_id = $3, revoked_at = $4
  WHERE caller_id = $1 AND capability = $2 AND status = 'active'
`;

const INSERT_CHANGE_SQL = `
  INSERT INTO authority_grant_changes
    (change_id, action, caller_id, capability, limits, valid_from,
     valid_until, reason, proposed_by, proposed_at, status)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`;

const SELECT_CHANGE_SQL = `
  SELECT * FROM authority_grant_changes WHERE change_id = $1
`;

const LOCK_CHANGE_SQL = `
  SELECT * FROM authority_grant_changes WHERE change_id = $1 FOR UPDATE
`;

const SELECT_CHANGES_SQL = `
  SELECT * FROM authority_grant_changes ORDER BY proposed_at DESC
`;

const SELECT_CHANGES_BY_STATUS_SQL = `
  SELECT * FROM authority_grant_changes WHERE status = $1 ORDER BY proposed_at DESC
`;

const RESOLVE_CHANGE_SQL = `
  UPDATE authority_grant_changes
  SET status = $2, resolved_by = $3, resolved_at = $4, rejection_reason = $5
  WHERE change_id = $1 AND status = 'PENDING_APPROVAL'
`;

type Limits = Readonly<Record<string, AuthorityGrantLimit>>;

interface GrantRow {
  readonly grant_id: string;
  readonly caller_id: string;
  readonly capability: string;
  readonly limits: Limits | null;
  readonly valid_from: string | Date;
  readonly valid_until: string | Date;
  readonly status: "active" | "revoked";
  readonly granted_at: string | Date;
  readonly revoked_by_change_id: string | null;
  readonly revoked_at: string | Date | null;
}

interface ChangeRow {
  readonly change_id: string;
  readonly action: AuthorityGrantChangeAction;
  readonly caller_id: string;
  readonly capability: string;
  readonly limits: Limits | null;
  readonly valid_from: string | Date | null;
  readonly valid_until: string | Date | null;
  readonly reason: string;
  readonly proposed_by: string;
  readonly proposed_at: string | Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolved_by: string | null;
  readonly resolved_at: string | Date | null;
  readonly rejection_reason: string | null;
}

function toGrant(row: GrantRow): AuthorityGrant {
  return {
    grantId: row.grant_id,
    callerId: row.caller_id,
    capability: row.capability,
    ...(row.limits !== null ? { limits: row.limits } : {}),
    validFrom: new Date(row.valid_from),
    validUntil: new Date(row.valid_until),
    status: row.status,
    grantedAt: new Date(row.granted_at),
    ...(row.revoked_by_change_id !== null
      ? { revokedByChangeId: row.revoked_by_change_id }
      : {}),
    ...(row.revoked_at !== null ? { revokedAt: new Date(row.revoked_at) } : {}),
  };
}

function toChange(row: ChangeRow): AuthorityGrantChange {
  return {
    changeId: row.change_id,
    action: row.action,
    callerId: row.caller_id,
    capability: row.capability,
    ...(row.limits !== null ? { limits: row.limits } : {}),
    ...(row.valid_from !== null ? { validFrom: new Date(row.valid_from) } : {}),
    ...(row.valid_until !== null
      ? { validUntil: new Date(row.valid_until) }
      : {}),
    reason: row.reason,
    proposedBy: row.proposed_by,
    proposedAt: new Date(row.proposed_at),
    status: row.status,
    ...(row.resolved_by !== null ? { resolvedBy: row.resolved_by } : {}),
    ...(row.resolved_at !== null
      ? { resolvedAt: new Date(row.resolved_at) }
      : {}),
    ...(row.rejection_reason !== null
      ? { rejectionReason: row.rejection_reason }
      : {}),
  };
}
