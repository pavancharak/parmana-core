import type { Pool } from "pg";

import type {
  InboundCheckRecord,
  InboundCheckRepository,
} from "@parmana/shared";

/**
 * Postgres-backed inbound check repository (RFC-0024). Writes the columns added by the
 * extend_inbound_decisions migration. The primary key makes a duplicate insert fail.
 */
export class SupabaseInboundCheckRepository implements InboundCheckRepository {
  constructor(private readonly pool: Pool) {}

  async append(record: InboundCheckRecord): Promise<void> {
    await this.pool.query(INSERT_SQL, [
      record.decisionId,
      record.outcome,
      record.reason ?? null,
      record.partnerId,
      record.expiresAt,
      record.audience,
      record.signature,
      record.issuedAt.toISOString(),
      record.capability,
      record.target ?? null,
      record.amount ?? null,
    ]);
  }

  async findById(decisionId: string): Promise<InboundCheckRecord | null> {
    const { rows } = await this.pool.query(SELECT_SQL, [decisionId]);
    const row = rows[0] as Row | undefined;
    if (!row) return null;
    return {
      decisionId: row.decision_id,
      outcome: row.outcome,
      ...(row.reason ? { reason: row.reason } : {}),
      partnerId: row.partner_id,
      capability: row.capability,
      ...(row.target ? { target: row.target } : {}),
      ...(row.amount !== null ? { amount: Number(row.amount) } : {}),
      expiresAt: new Date(row.expires_at).toISOString(),
      audience: row.audience,
      signature: row.signature,
      issuedAt: new Date(row.issued_at),
    };
  }
}

interface Row {
  decision_id: string;
  outcome: "approved" | "rejected";
  reason: string | null;
  partner_id: string;
  capability: string;
  target: string | null;
  amount: string | number | null;
  expires_at: string | Date;
  audience: string;
  signature: string;
  issued_at: string | Date;
}

const INSERT_SQL = `
  INSERT INTO inbound_decisions (
    decision_id, outcome, reason, partner_id, expires_at, audience, signature,
    issued_at, capability, target, amount, check_status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'verified')
`;

const SELECT_SQL = `
  SELECT decision_id, outcome, reason, partner_id, capability, target, amount,
         expires_at, audience, signature, issued_at
  FROM inbound_decisions
  WHERE decision_id = $1 AND capability IS NOT NULL
`;
