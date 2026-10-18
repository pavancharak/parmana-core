import type { Pool, PoolClient } from "pg";

import {
  BusinessSignalSourceChangeNotFoundError,
  PendingPolicyChangeStatus,
  type BusinessSignalSourceChange,
  type BusinessSignalSourceChangeAction,
  type BusinessSignalSourceRegistration,
  type BusinessSignalSourceRepository,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";
import {
  businessSignalSourceAlreadyActive,
  businessSignalSourceAlreadyResolved,
  businessSignalSourceNotActive,
  businessSignalSourcePendingConflict,
} from "../memory/MemoryBusinessSignalSourceRepository.js";

/**
 * Postgres backed BusinessSignalSourceRepository (migration
 * 20261010120000_add_business_signal_sources.sql), over a direct connection
 * like every other repository in this package.
 *
 * approveChange locks the change row, applies it to
 * business_signal_sources, and resolves it in one transaction, so a
 * registration is never added or revoked without an APPROVED change
 * behind it, and two approvals of the same change cannot both apply.
 * "One pending change per name" and "one active registration per
 * name" are enforced by the partial unique indexes
 * ux_business_signal_source_changes_open and ux_business_signal_sources_active.
 */
export class SupabaseBusinessSignalSourceRepository implements BusinessSignalSourceRepository {
  constructor(private readonly pool: Pool) {}

  async findActive(
    name: string,
  ): Promise<BusinessSignalSourceRegistration | null> {
    const { rows } = await this.pool.query(SELECT_ACTIVE_SQL, [name]);

    return rows[0] ? toRegistration(rows[0] as RegistrationRow) : null;
  }

  async listRegistrations(): Promise<
    readonly BusinessSignalSourceRegistration[]
  > {
    const { rows } = await this.pool.query(SELECT_REGISTRATIONS_SQL);

    return (rows as RegistrationRow[]).map(toRegistration);
  }

  async createChange(
    change: BusinessSignalSourceChange,
  ): Promise<BusinessSignalSourceChange> {
    try {
      await this.pool.query(INSERT_CHANGE_SQL, [
        change.changeId,
        change.action,
        change.name,
        change.endpointUrl ?? null,
        change.timeoutMs ?? null,
        change.publicKeyPem ?? null,
        change.keyId ?? null,
        change.reason,
        change.proposedBy,
        change.proposedAt.toISOString(),
        change.status,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw businessSignalSourcePendingConflict(change);
      }

      throw error;
    }

    return change;
  }

  async findChange(
    changeId: string,
  ): Promise<BusinessSignalSourceChange | null> {
    const { rows } = await this.pool.query(SELECT_CHANGE_SQL, [changeId]);

    return rows[0] ? toChange(rows[0] as ChangeRow) : null;
  }

  async listChanges(
    status?: BusinessSignalSourceChange["status"],
  ): Promise<readonly BusinessSignalSourceChange[]> {
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
  ): Promise<BusinessSignalSourceChange> {
    return this.inTransaction(async (client) => {
      const change = await lockPending(client, changeId);

      if (change.action === "register") {
        try {
          await client.query(INSERT_REGISTRATION_SQL, [
            change.changeId,
            change.name,
            change.endpointUrl,
            change.timeoutMs,
            change.publicKeyPem ?? null,
            change.keyId ?? null,
            at.toISOString(),
          ]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw businessSignalSourceAlreadyActive(change);
          }

          throw error;
        }
      } else {
        const { rowCount } = await client.query(REVOKE_REGISTRATION_SQL, [
          change.name,
          change.changeId,
          at.toISOString(),
        ]);

        if (rowCount === 0) {
          throw businessSignalSourceNotActive(change);
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
  ): Promise<BusinessSignalSourceChange> {
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
): Promise<BusinessSignalSourceChange> {
  const { rows } = await client.query(LOCK_CHANGE_SQL, [changeId]);

  if (!rows[0]) {
    throw new BusinessSignalSourceChangeNotFoundError(changeId);
  }

  const change = toChange(rows[0] as ChangeRow);

  if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
    throw businessSignalSourceAlreadyResolved(change);
  }

  return change;
}

const SELECT_ACTIVE_SQL = `
  SELECT * FROM business_signal_sources WHERE name = $1 AND status = 'active'
`;

const SELECT_REGISTRATIONS_SQL = `
  SELECT * FROM business_signal_sources ORDER BY registered_at, name
`;

const INSERT_REGISTRATION_SQL = `
  INSERT INTO business_signal_sources
    (registration_id, name, endpoint_url, timeout_ms, public_key_pem,
     key_id, status, registered_at)
  VALUES
    ($1, $2, $3, $4, $5, $6, 'active', $7)
`;

const REVOKE_REGISTRATION_SQL = `
  UPDATE business_signal_sources
  SET status = 'revoked', revoked_by_change_id = $2, revoked_at = $3
  WHERE name = $1 AND status = 'active'
`;

const INSERT_CHANGE_SQL = `
  INSERT INTO business_signal_source_changes
    (change_id, action, name, endpoint_url, timeout_ms, public_key_pem,
     key_id, reason, proposed_by, proposed_at, status)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`;

const SELECT_CHANGE_SQL = `
  SELECT * FROM business_signal_source_changes WHERE change_id = $1
`;

const LOCK_CHANGE_SQL = `
  SELECT * FROM business_signal_source_changes WHERE change_id = $1 FOR UPDATE
`;

const SELECT_CHANGES_SQL = `
  SELECT * FROM business_signal_source_changes ORDER BY proposed_at DESC
`;

const SELECT_CHANGES_BY_STATUS_SQL = `
  SELECT * FROM business_signal_source_changes WHERE status = $1 ORDER BY proposed_at DESC
`;

const RESOLVE_CHANGE_SQL = `
  UPDATE business_signal_source_changes
  SET status = $2, resolved_by = $3, resolved_at = $4, rejection_reason = $5
  WHERE change_id = $1 AND status = 'PENDING_APPROVAL'
`;

interface RegistrationRow {
  readonly registration_id: string;
  readonly name: string;
  readonly endpoint_url: string;
  readonly timeout_ms: number;
  readonly public_key_pem: string | null;
  readonly key_id: string | null;
  readonly status: "active" | "revoked";
  readonly registered_at: string | Date;
  readonly revoked_by_change_id: string | null;
  readonly revoked_at: string | Date | null;
}

interface ChangeRow {
  readonly change_id: string;
  readonly action: BusinessSignalSourceChangeAction;
  readonly name: string;
  readonly endpoint_url: string | null;
  readonly timeout_ms: number | null;
  readonly public_key_pem: string | null;
  readonly key_id: string | null;
  readonly reason: string;
  readonly proposed_by: string;
  readonly proposed_at: string | Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolved_by: string | null;
  readonly resolved_at: string | Date | null;
  readonly rejection_reason: string | null;
}

function toRegistration(
  row: RegistrationRow,
): BusinessSignalSourceRegistration {
  return {
    registrationId: row.registration_id,
    name: row.name,
    endpointUrl: row.endpoint_url,
    timeoutMs: row.timeout_ms,
    ...(row.public_key_pem !== null
      ? { publicKeyPem: row.public_key_pem }
      : {}),
    ...(row.key_id !== null ? { keyId: row.key_id } : {}),
    status: row.status,
    registeredAt: new Date(row.registered_at),
    ...(row.revoked_by_change_id !== null
      ? { revokedByChangeId: row.revoked_by_change_id }
      : {}),
    ...(row.revoked_at !== null ? { revokedAt: new Date(row.revoked_at) } : {}),
  };
}

function toChange(row: ChangeRow): BusinessSignalSourceChange {
  return {
    changeId: row.change_id,
    action: row.action,
    name: row.name,
    ...(row.endpoint_url !== null ? { endpointUrl: row.endpoint_url } : {}),
    ...(row.timeout_ms !== null ? { timeoutMs: row.timeout_ms } : {}),
    ...(row.public_key_pem !== null
      ? { publicKeyPem: row.public_key_pem }
      : {}),
    ...(row.key_id !== null ? { keyId: row.key_id } : {}),
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
