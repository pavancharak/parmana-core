import type { Pool, PoolClient } from "pg";

import {
  ApprovalIssuerChangeNotFoundError,
  PendingPolicyChangeStatus,
  type ApprovalIssuerChange,
  type ApprovalIssuerChangeAction,
  type ApprovalIssuerRecord,
  type ApprovalIssuerRepository,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";
import {
  alreadyExists,
  alreadyResolved,
  notRevocable,
  pendingConflict,
} from "../memory/MemoryApprovalIssuerRepository.js";

/**
 * Postgres backed ApprovalIssuerRepository (migration
 * 20260929120000_add_approval_issuers.sql), over a direct connection
 * like every other repository in this package.
 *
 * approveChange locks the change row, applies it to approval_issuers,
 * and resolves it in one transaction, so a key is never added or
 * revoked without an APPROVED change behind it, and two approvals of
 * the same change cannot both apply. "One pending change per approver
 * and key" is enforced by the partial unique index
 * ux_approval_issuer_changes_open.
 */
export class SupabaseApprovalIssuerRepository implements ApprovalIssuerRepository {
  constructor(private readonly pool: Pool) {}

  async findIssuer(
    approverId: string,
    keyId: string,
  ): Promise<ApprovalIssuerRecord | null> {
    const { rows } = await this.pool.query(SELECT_ISSUER_SQL, [
      approverId,
      keyId,
    ]);

    return rows[0] ? toIssuer(rows[0] as IssuerRow) : null;
  }

  async listIssuers(): Promise<readonly ApprovalIssuerRecord[]> {
    const { rows } = await this.pool.query(SELECT_ISSUERS_SQL);

    return (rows as IssuerRow[]).map(toIssuer);
  }

  async createChange(
    change: ApprovalIssuerChange,
  ): Promise<ApprovalIssuerChange> {
    try {
      await this.pool.query(INSERT_CHANGE_SQL, [
        change.changeId,
        change.action,
        change.approverId,
        change.keyId,
        change.publicKeyPem ?? null,
        change.reason,
        change.proposedBy,
        change.proposedAt.toISOString(),
        change.status,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw pendingConflict(change);
      }

      throw error;
    }

    return change;
  }

  async findChange(changeId: string): Promise<ApprovalIssuerChange | null> {
    const { rows } = await this.pool.query(SELECT_CHANGE_SQL, [changeId]);

    return rows[0] ? toChange(rows[0] as ChangeRow) : null;
  }

  async listChanges(
    status?: ApprovalIssuerChange["status"],
  ): Promise<readonly ApprovalIssuerChange[]> {
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
  ): Promise<ApprovalIssuerChange> {
    return this.inTransaction(async (client) => {
      const change = await lockPending(client, changeId);

      if (change.action === "add") {
        try {
          await client.query(INSERT_ISSUER_SQL, [
            change.approverId,
            change.keyId,
            change.publicKeyPem,
            change.changeId,
            at.toISOString(),
          ]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw alreadyExists(change);
          }

          throw error;
        }
      } else {
        const { rowCount } = await client.query(REVOKE_ISSUER_SQL, [
          change.approverId,
          change.keyId,
          change.changeId,
          at.toISOString(),
        ]);

        if (rowCount === 0) {
          throw notRevocable(change);
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
  ): Promise<ApprovalIssuerChange> {
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
): Promise<ApprovalIssuerChange> {
  const { rows } = await client.query(LOCK_CHANGE_SQL, [changeId]);

  if (!rows[0]) {
    throw new ApprovalIssuerChangeNotFoundError(changeId);
  }

  const change = toChange(rows[0] as ChangeRow);

  if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
    throw alreadyResolved(change);
  }

  return change;
}

const SELECT_ISSUER_SQL = `
  SELECT * FROM approval_issuers WHERE approver_id = $1 AND key_id = $2
`;

const SELECT_ISSUERS_SQL = `
  SELECT * FROM approval_issuers ORDER BY added_at, approver_id, key_id
`;

const INSERT_ISSUER_SQL = `
  INSERT INTO approval_issuers
    (approver_id, key_id, public_key_pem, revoked, added_by_change_id, added_at)
  VALUES
    ($1, $2, $3, FALSE, $4, $5)
`;

const REVOKE_ISSUER_SQL = `
  UPDATE approval_issuers
  SET revoked = TRUE, revoked_by_change_id = $3, revoked_at = $4
  WHERE approver_id = $1 AND key_id = $2 AND revoked = FALSE
`;

const INSERT_CHANGE_SQL = `
  INSERT INTO approval_issuer_changes
    (change_id, action, approver_id, key_id, public_key_pem, reason,
     proposed_by, proposed_at, status)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

const SELECT_CHANGE_SQL = `
  SELECT * FROM approval_issuer_changes WHERE change_id = $1
`;

const LOCK_CHANGE_SQL = `
  SELECT * FROM approval_issuer_changes WHERE change_id = $1 FOR UPDATE
`;

const SELECT_CHANGES_SQL = `
  SELECT * FROM approval_issuer_changes ORDER BY proposed_at DESC
`;

const SELECT_CHANGES_BY_STATUS_SQL = `
  SELECT * FROM approval_issuer_changes WHERE status = $1 ORDER BY proposed_at DESC
`;

const RESOLVE_CHANGE_SQL = `
  UPDATE approval_issuer_changes
  SET status = $2, resolved_by = $3, resolved_at = $4, rejection_reason = $5
  WHERE change_id = $1 AND status = 'PENDING_APPROVAL'
`;

interface IssuerRow {
  readonly approver_id: string;
  readonly key_id: string;
  readonly public_key_pem: string;
  readonly revoked: boolean;
  readonly added_by_change_id: string;
  readonly added_at: string | Date;
  readonly revoked_by_change_id: string | null;
  readonly revoked_at: string | Date | null;
}

interface ChangeRow {
  readonly change_id: string;
  readonly action: ApprovalIssuerChangeAction;
  readonly approver_id: string;
  readonly key_id: string;
  readonly public_key_pem: string | null;
  readonly reason: string;
  readonly proposed_by: string;
  readonly proposed_at: string | Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolved_by: string | null;
  readonly resolved_at: string | Date | null;
  readonly rejection_reason: string | null;
}

function toIssuer(row: IssuerRow): ApprovalIssuerRecord {
  return {
    approverId: row.approver_id,
    keyId: row.key_id,
    publicKeyPem: row.public_key_pem,
    revoked: row.revoked,
    addedByChangeId: row.added_by_change_id,
    addedAt: new Date(row.added_at),
    ...(row.revoked_by_change_id !== null
      ? { revokedByChangeId: row.revoked_by_change_id }
      : {}),
    ...(row.revoked_at !== null ? { revokedAt: new Date(row.revoked_at) } : {}),
  };
}

function toChange(row: ChangeRow): ApprovalIssuerChange {
  return {
    changeId: row.change_id,
    action: row.action,
    approverId: row.approver_id,
    keyId: row.key_id,
    ...(row.public_key_pem !== null
      ? { publicKeyPem: row.public_key_pem }
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
