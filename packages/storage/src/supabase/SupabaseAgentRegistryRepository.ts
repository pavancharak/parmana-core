import type { Pool } from "pg";

import type {
  AgentRecord,
  AgentRegistryRepository,
  NewAgentRecord,
} from "@parmana/shared";

/**
 * Postgres agent registry, backed by agents (20261108120000_add_agent_registry.sql).
 *
 * A query error propagates. The token check treats it as a refusal, never as a valid agent.
 */
export class SupabaseAgentRegistryRepository implements AgentRegistryRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async findByAgentId(agentId: string): Promise<AgentRecord | undefined> {
    const { rows } = await this.pool.query(SELECT_BY_AGENT_ID_SQL, [agentId]);
    return rows[0] === undefined ? undefined : toRecord(rows[0]);
  }

  async findByClientId(clientId: string): Promise<AgentRecord | undefined> {
    const { rows } = await this.pool.query(SELECT_BY_CLIENT_ID_SQL, [clientId]);
    return rows[0] === undefined ? undefined : toRecord(rows[0]);
  }

  async register(agent: NewAgentRecord): Promise<void> {
    await this.pool.query(INSERT_SQL, [
      agent.agentId,
      agent.clientId,
      agent.clientSecretHash,
      agent.partnerId,
      agent.allowedCapabilities ?? null,
      agent.allowedPrincipalIds ?? null,
      agent.allowedTenantIds ?? null,
      agent.registeredBy,
      agent.approvedBy,
      agent.registeredAt.toISOString(),
    ]);
  }

  async revoke(revocation: {
    readonly agentId: string;
    readonly revokedBy: string;
    readonly reason: string;
    readonly revokedAt: Date;
  }): Promise<void> {
    await this.pool.query(REVOKE_SQL, [
      revocation.agentId,
      revocation.revokedAt.toISOString(),
      revocation.revokedBy,
      revocation.reason,
    ]);
  }
}

const COLUMNS = `agent_id, client_id, client_secret_hash, partner_id,
  allowed_capabilities, allowed_principal_ids, allowed_tenant_ids,
  registered_by, approved_by, registered_at, revoked_at, revoked_by, revoke_reason`;

const SELECT_BY_AGENT_ID_SQL = `SELECT ${COLUMNS} FROM agents WHERE agent_id = $1`;
const SELECT_BY_CLIENT_ID_SQL = `SELECT ${COLUMNS} FROM agents WHERE client_id = $1`;

// The table's CHECK refuses registered_by = approved_by, so the database enforces maker and checker too.
const INSERT_SQL = `
  INSERT INTO agents
    (agent_id, client_id, client_secret_hash, partner_id,
     allowed_capabilities, allowed_principal_ids, allowed_tenant_ids,
     registered_by, approved_by, registered_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
`;

const REVOKE_SQL = `
  UPDATE agents
     SET revoked_at = $2, revoked_by = $3, revoke_reason = $4
   WHERE agent_id = $1 AND revoked_at IS NULL
`;

interface AgentRow {
  agent_id: string;
  client_id: string;
  client_secret_hash: string;
  partner_id: string;
  allowed_capabilities: string[] | null;
  allowed_principal_ids: string[] | null;
  allowed_tenant_ids: string[] | null;
  registered_by: string;
  approved_by: string;
  registered_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

function toRecord(row: unknown): AgentRecord {
  const r = row as AgentRow;
  return {
    agentId: r.agent_id,
    clientId: r.client_id,
    clientSecretHash: r.client_secret_hash,
    partnerId: r.partner_id,
    ...(r.allowed_capabilities !== null ? { allowedCapabilities: r.allowed_capabilities } : {}),
    ...(r.allowed_principal_ids !== null ? { allowedPrincipalIds: r.allowed_principal_ids } : {}),
    ...(r.allowed_tenant_ids !== null ? { allowedTenantIds: r.allowed_tenant_ids } : {}),
    registeredBy: r.registered_by,
    approvedBy: r.approved_by,
    registeredAt: new Date(r.registered_at),
    revoked: r.revoked_at !== null,
    ...(r.revoked_at !== null ? { revokedAt: new Date(r.revoked_at) } : {}),
    ...(r.revoked_by !== null ? { revokedBy: r.revoked_by } : {}),
    ...(r.revoke_reason !== null ? { revokeReason: r.revoke_reason } : {}),
  };
}
