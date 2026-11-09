import type { Pool } from "pg";

import type {
  InboundOutcomeRecord,
  InboundOutcomeRepository,
} from "@parmana/shared";

/**
 * Postgres-backed inbound outcome repository (RFC-0025). The primary key on decision_id makes a
 * second outcome for the same decision insert nothing, so append() returns false.
 */
export class PostgresInboundOutcomeRepository implements InboundOutcomeRepository {
  constructor(private readonly pool: Pool) {}

  async append(record: InboundOutcomeRecord): Promise<boolean> {
    const { rows } = await this.pool.query(INSERT_SQL, [
      record.decisionId,
      record.partnerId,
      record.orderId,
      record.paymentId,
      record.amountInr,
      record.status,
      record.refundId ?? null,
      record.reason ?? null,
      record.recordedAt.toISOString(),
    ]);
    return rows.length === 1;
  }

  async findByDecisionId(
    decisionId: string,
  ): Promise<InboundOutcomeRecord | null> {
    const { rows } = await this.pool.query(SELECT_SQL, [decisionId]);
    const row = rows[0] as Row | undefined;
    if (!row) return null;
    return {
      decisionId: row.decision_id,
      partnerId: row.partner_id,
      orderId: row.order_id,
      paymentId: row.payment_id,
      amountInr: Number(row.amount_inr),
      status: row.status,
      ...(row.refund_id ? { refundId: row.refund_id } : {}),
      ...(row.reason ? { reason: row.reason } : {}),
      recordedAt: new Date(row.recorded_at),
    };
  }
}

interface Row {
  decision_id: string;
  partner_id: string;
  order_id: string;
  payment_id: string;
  amount_inr: string | number;
  status: "refunded" | "refused" | "error";
  refund_id: string | null;
  reason: string | null;
  recorded_at: string | Date;
}

const INSERT_SQL = `
  INSERT INTO inbound_outcomes (
    decision_id, partner_id, order_id, payment_id, amount_inr,
    status, refund_id, reason, recorded_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (decision_id) DO NOTHING
  RETURNING decision_id
`;

const SELECT_SQL = `
  SELECT decision_id, partner_id, order_id, payment_id, amount_inr,
         status, refund_id, reason, recorded_at
  FROM inbound_outcomes
  WHERE decision_id = $1
`;
