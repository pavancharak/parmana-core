import type { Pool } from "pg";

import type {
  InboundDecisionRecord,
  InboundDecisionRepository,
} from "@parmana/shared";

/**
 * Postgres-backed inbound decision repository (RFC-0025). A single insert and a single lookup.
 * The primary key on decision_id makes a duplicate insert fail, so a decision cannot be recorded
 * twice.
 */
export class PostgresInboundDecisionRepository implements InboundDecisionRepository {
  constructor(private readonly pool: Pool) {}

  async append(record: InboundDecisionRecord): Promise<void> {
    await this.pool.query(INSERT_SQL, [
      record.decisionId,
      record.outcome,
      record.reason ?? null,
      record.partnerId,
      record.paymentId,
      record.limitInr,
      record.expiresAt,
      record.audience,
      record.signature,
      record.issuedAt.toISOString(),
    ]);
  }

  async findById(decisionId: string): Promise<InboundDecisionRecord | null> {
    const { rows } = await this.pool.query(SELECT_SQL, [decisionId]);
    const row = rows[0] as Row | undefined;
    if (!row) return null;
    return {
      decisionId: row.decision_id,
      outcome: row.outcome,
      ...(row.reason ? { reason: row.reason } : {}),
      partnerId: row.partner_id,
      paymentId: row.payment_id,
      limitInr: Number(row.limit_inr),
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
  payment_id: string;
  limit_inr: string | number;
  expires_at: string | Date;
  audience: string;
  signature: string;
  issued_at: string | Date;
}

const INSERT_SQL = `
  INSERT INTO inbound_decisions (
    decision_id, outcome, reason, partner_id, payment_id, limit_inr,
    expires_at, audience, signature, issued_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
`;

const SELECT_SQL = `
  SELECT decision_id, outcome, reason, partner_id, payment_id, limit_inr,
         expires_at, audience, signature, issued_at
  FROM inbound_decisions
  WHERE decision_id = $1
`;
