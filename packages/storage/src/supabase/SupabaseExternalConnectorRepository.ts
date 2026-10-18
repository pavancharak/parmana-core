import type { Pool, PoolClient } from "pg";

import {
  ExternalConnectorChangeNotFoundError,
  PendingPolicyChangeStatus,
  type ExternalConnectorChange,
  type ExternalConnectorChangeAction,
  type ExternalConnectorRegistration,
  type ExternalConnectorRepository,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";
import {
  externalConnectorAlreadyActive,
  externalConnectorAlreadyResolved,
  externalConnectorNotActive,
  externalConnectorPendingConflict,
} from "../memory/MemoryExternalConnectorRepository.js";

/**
 * Postgres backed ExternalConnectorRepository (migration
 * 20260930120000_add_external_connectors.sql), over a direct connection
 * like every other repository in this package.
 *
 * approveChange locks the change row, applies it to
 * external_connectors, and resolves it in one transaction, so a
 * registration is never added or revoked without an APPROVED change
 * behind it, and two approvals of the same change cannot both apply.
 * "One pending change per capability" and "one active registration per
 * capability" are enforced by the partial unique indexes
 * ux_external_connector_changes_open and ux_external_connectors_active.
 */
export class SupabaseExternalConnectorRepository implements ExternalConnectorRepository {
  constructor(private readonly pool: Pool) {}

  async findActive(
    capability: string,
  ): Promise<ExternalConnectorRegistration | null> {
    const { rows } = await this.pool.query(SELECT_ACTIVE_SQL, [capability]);

    return rows[0] ? toRegistration(rows[0] as RegistrationRow) : null;
  }

  async listRegistrations(): Promise<readonly ExternalConnectorRegistration[]> {
    const { rows } = await this.pool.query(SELECT_REGISTRATIONS_SQL);

    return (rows as RegistrationRow[]).map(toRegistration);
  }

  async createChange(
    change: ExternalConnectorChange,
  ): Promise<ExternalConnectorChange> {
    try {
      await this.pool.query(INSERT_CHANGE_SQL, [
        change.changeId,
        change.action,
        change.capability,
        change.endpointUrl ?? null,
        change.policy ?? null,
        change.allowedParameters ?? null,
        change.timeoutMs ?? null,
        change.reason,
        change.proposedBy,
        change.proposedAt.toISOString(),
        change.status,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw externalConnectorPendingConflict(change);
      }

      throw error;
    }

    return change;
  }

  async findChange(changeId: string): Promise<ExternalConnectorChange | null> {
    const { rows } = await this.pool.query(SELECT_CHANGE_SQL, [changeId]);

    return rows[0] ? toChange(rows[0] as ChangeRow) : null;
  }

  async listChanges(
    status?: ExternalConnectorChange["status"],
  ): Promise<readonly ExternalConnectorChange[]> {
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
  ): Promise<ExternalConnectorChange> {
    return this.inTransaction(async (client) => {
      const change = await lockPending(client, changeId);

      if (change.action === "register") {
        try {
          await client.query(INSERT_REGISTRATION_SQL, [
            change.changeId,
            change.capability,
            change.endpointUrl,
            change.policy,
            change.allowedParameters,
            change.timeoutMs,
            at.toISOString(),
          ]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw externalConnectorAlreadyActive(change);
          }

          throw error;
        }
      } else {
        const { rowCount } = await client.query(REVOKE_REGISTRATION_SQL, [
          change.capability,
          change.changeId,
          at.toISOString(),
        ]);

        if (rowCount === 0) {
          throw externalConnectorNotActive(change);
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
  ): Promise<ExternalConnectorChange> {
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
): Promise<ExternalConnectorChange> {
  const { rows } = await client.query(LOCK_CHANGE_SQL, [changeId]);

  if (!rows[0]) {
    throw new ExternalConnectorChangeNotFoundError(changeId);
  }

  const change = toChange(rows[0] as ChangeRow);

  if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
    throw externalConnectorAlreadyResolved(change);
  }

  return change;
}

const SELECT_ACTIVE_SQL = `
  SELECT * FROM external_connectors WHERE capability = $1 AND status = 'active'
`;

const SELECT_REGISTRATIONS_SQL = `
  SELECT * FROM external_connectors ORDER BY registered_at, capability
`;

const INSERT_REGISTRATION_SQL = `
  INSERT INTO external_connectors
    (registration_id, capability, endpoint_url, policy_name,
     allowed_parameters, timeout_ms, status, registered_at)
  VALUES
    ($1, $2, $3, $4, $5, $6, 'active', $7)
`;

const REVOKE_REGISTRATION_SQL = `
  UPDATE external_connectors
  SET status = 'revoked', revoked_by_change_id = $2, revoked_at = $3
  WHERE capability = $1 AND status = 'active'
`;

const INSERT_CHANGE_SQL = `
  INSERT INTO external_connector_changes
    (change_id, action, capability, endpoint_url, policy_name,
     allowed_parameters, timeout_ms, reason, proposed_by, proposed_at, status)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`;

const SELECT_CHANGE_SQL = `
  SELECT * FROM external_connector_changes WHERE change_id = $1
`;

const LOCK_CHANGE_SQL = `
  SELECT * FROM external_connector_changes WHERE change_id = $1 FOR UPDATE
`;

const SELECT_CHANGES_SQL = `
  SELECT * FROM external_connector_changes ORDER BY proposed_at DESC
`;

const SELECT_CHANGES_BY_STATUS_SQL = `
  SELECT * FROM external_connector_changes WHERE status = $1 ORDER BY proposed_at DESC
`;

const RESOLVE_CHANGE_SQL = `
  UPDATE external_connector_changes
  SET status = $2, resolved_by = $3, resolved_at = $4, rejection_reason = $5
  WHERE change_id = $1 AND status = 'PENDING_APPROVAL'
`;

interface RegistrationRow {
  readonly registration_id: string;
  readonly capability: string;
  readonly endpoint_url: string;
  readonly policy_name: string;
  readonly allowed_parameters: string[];
  readonly timeout_ms: number;
  readonly status: "active" | "revoked";
  readonly registered_at: string | Date;
  readonly revoked_by_change_id: string | null;
  readonly revoked_at: string | Date | null;
}

interface ChangeRow {
  readonly change_id: string;
  readonly action: ExternalConnectorChangeAction;
  readonly capability: string;
  readonly endpoint_url: string | null;
  readonly policy_name: string | null;
  readonly allowed_parameters: string[] | null;
  readonly timeout_ms: number | null;
  readonly reason: string;
  readonly proposed_by: string;
  readonly proposed_at: string | Date;
  readonly status: PendingPolicyChangeStatus;
  readonly resolved_by: string | null;
  readonly resolved_at: string | Date | null;
  readonly rejection_reason: string | null;
}

function toRegistration(row: RegistrationRow): ExternalConnectorRegistration {
  return {
    registrationId: row.registration_id,
    capability: row.capability,
    endpointUrl: row.endpoint_url,
    policy: row.policy_name,
    allowedParameters: row.allowed_parameters,
    timeoutMs: row.timeout_ms,
    status: row.status,
    registeredAt: new Date(row.registered_at),
    ...(row.revoked_by_change_id !== null
      ? { revokedByChangeId: row.revoked_by_change_id }
      : {}),
    ...(row.revoked_at !== null ? { revokedAt: new Date(row.revoked_at) } : {}),
  };
}

function toChange(row: ChangeRow): ExternalConnectorChange {
  return {
    changeId: row.change_id,
    action: row.action,
    capability: row.capability,
    ...(row.endpoint_url !== null ? { endpointUrl: row.endpoint_url } : {}),
    ...(row.policy_name !== null ? { policy: row.policy_name } : {}),
    ...(row.allowed_parameters !== null
      ? { allowedParameters: row.allowed_parameters }
      : {}),
    ...(row.timeout_ms !== null ? { timeoutMs: row.timeout_ms } : {}),
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
