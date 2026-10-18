import type { Pool } from "pg";

import {
  AuditEventCrypto,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";

import type { ExecutionAuditEvent, ExecutionAuditSink } from "@parmana/shared";

/**
 * Durable, Supabase-backed ExecutionAuditSink. Closes GAP-1 (GAPS.md
 * 2026-09-14): execution.rejected/execution.completed/session.created
 * events now survive a process restart instead of living only in
 * MemoryExecutionAuditSink's process-local array (still the correct
 * choice for tests — see
 * packages/api/src/bootstrap/createExecutionAuditSink.ts).
 *
 * Mirrors packages/api/src/auth/SupabaseCallerAuditSink.ts's own
 * discipline exactly: signed at write time (so a plain durable row
 * can't be silently altered by anyone with database access), and
 * writes via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST — same PostgREST schema-cache workaround
 * (Supabase ticket SU-437429) documented on that class, now the
 * storage layer's deliberate architecture across Supabase-backed
 * tables generally, not a narrow one-table fix.
 *
 * Chained per authorizationId, not globally and not per-caller:
 * every ExecutionAuditEvent carries an authorizationId (unlike
 * CallerAuditEvent, which sometimes has no callerId at all — the
 * earliest possible rejection, before any caller is identified), so
 * this column is NOT NULL and every event participates in a chain.
 * An authorization's own lifecycle (session.created ->
 * execution.completed or execution.rejected) is exactly the unit a
 * regulator asks about, so that's the unit chained together. Takes a
 * Postgres advisory transaction lock scoped to
 * hashtext(authorizationId), serializing only a given authorization's
 * own concurrent writes, never a different authorization's.
 *
 * Failure semantics: unchanged from MemoryExecutionAuditSink.
 * record() has always been an unguarded `await` in
 * ExecutionControlService.execute() — that call site has no
 * try/catch around the audit write itself; a write failure here
 * rejects the returned promise exactly like any other failed
 * Supabase insert elsewhere in this codebase.
 *
 * Shared table, two writers (GAP-3, GAPS.md 2026-09-14): this class
 * is not the only thing that writes to execution_audit_events —
 * parmana-paytm-agent (a separate, out-of-process, lower-trust
 * repository) has its own minimal audit writer (src/parmana/audit.ts
 * in that repo) recording what it independently verified and
 * executed, since its own request path previously logged nothing at
 * all. Its rows carry businessTransactionId (the only correlation id
 * available across that trust boundary — see
 * ExecutionAuditEvent.businessTransactionId's own doc comment) but no
 * signature/chain (it holds no signing key), and its own
 * authorizationId is a value it invents for its own two-event
 * chain, unrelated to Parmana's authorizationId chained here.
 * query({ businessTransactionId }) is how a regulator retrieves one
 * refund's complete story across both writers; query({
 * authorizationId }) retrieves only this side's own chain.
 */
const INSERT_EXECUTION_AUDIT_EVENT_SQL = `
  INSERT INTO execution_audit_events
    (type, occurred_at, connector_id, authorization_id, session_id, action, reason, credential_id, gateway_id, business_transaction_id, signature_json, chain_hash, previous_chain_hash, chain_position)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
`;

const LAST_AUTHORIZATION_CHAIN_LINK_SQL = `
  SELECT chain_hash, chain_position
  FROM execution_audit_events
  WHERE authorization_id = $1
  ORDER BY id DESC
  LIMIT 1
`;

interface LastChainLinkRow {
  readonly chain_hash: string;
  readonly chain_position: number | string;
}

/**
 * Regulator-facing lookup: "show me everything that happened for this
 * authorization / this connector / in this date range." Deliberately
 * a capability of this Supabase-backed class specifically, not part
 * of the core ExecutionAuditSink interface — MemoryExecutionAuditSink
 * (execution-control, execution-gateway) has no durable store to
 * query, and every filter here is a plain WHERE clause over exactly
 * the columns the migration indexes.
 */
export interface ExecutionAuditQueryFilter {
  readonly authorizationId?: string;
  readonly businessTransactionId?: string;
  readonly connectorId?: string;
  readonly type?: ExecutionAuditEvent["type"];
  readonly occurredFrom?: string;
  readonly occurredTo?: string;
  readonly limit?: number;
}

/**
 * chainHash/chainPosition are nullable here (unlike this class's own
 * record() output, which always populates them): a row this class
 * reads back via query() may have been written by a different,
 * unsigned writer sharing this same durable store — e.g.
 * parmana-paytm-agent's own audit writer, which has no Parmana
 * private key to sign with and no chain of its own to extend. See
 * this table's own migration (20260914130000_add_business_
 * transaction_correlation_to_execution_audit_events.sql) for why
 * those columns are nullable at the schema level.
 */
export interface StoredExecutionAuditEvent extends ExecutionAuditEvent {
  readonly chainHash: string | null;
  readonly previousChainHash: string | null;
  readonly chainPosition: number | null;
}

interface ExecutionAuditEventRow {
  readonly type: ExecutionAuditEvent["type"];
  readonly occurred_at: Date;
  readonly connector_id: string;
  readonly authorization_id: string;
  readonly session_id: string;
  readonly action: string | null;
  readonly reason: string | null;
  readonly credential_id: string | null;
  readonly gateway_id: string | null;
  readonly business_transaction_id: string | null;
  readonly chain_hash: string | null;
  readonly previous_chain_hash: string | null;
  readonly chain_position: number | null;
}

const DEFAULT_QUERY_LIMIT = 100;

export class SupabaseExecutionAuditSink implements ExecutionAuditSink {
  private readonly crypto = new AuditEventCrypto();

  private readonly chainHasher = new TrustRecordHasher(
    CryptoBootstrap.create(),
  );

  constructor(private readonly pool: Pool) {}

  async record(event: ExecutionAuditEvent): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        event.authorizationId,
      ]);

      const { rows } = await client.query<LastChainLinkRow>(
        LAST_AUTHORIZATION_CHAIN_LINK_SQL,
        [event.authorizationId],
      );

      const previousChainHash = rows[0]?.chain_hash ?? null;

      const chainPosition =
        rows[0]?.chain_position != null
          ? Number(rows[0].chain_position) + 1
          : 1;

      const chainedContent = {
        ...event,
        previousChainHash,
        chainPosition,
      };

      const signature = await this.crypto.sign(chainedContent);
      const chainHash = await this.chainHasher.hash(chainedContent);

      await client.query(INSERT_EXECUTION_AUDIT_EVENT_SQL, [
        event.type,
        event.occurredAt,
        event.connectorId,
        event.authorizationId,
        event.sessionId,
        event.action ?? null,
        event.reason ?? null,
        event.credentialId ?? null,
        event.gatewayId ?? null,
        event.businessTransactionId ?? null,
        JSON.stringify(signature),
        chainHash,
        previousChainHash,
        chainPosition,
      ]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Regulator/operator lookup against the durable store. No filter
   * fields are required — an empty filter returns the most recent
   * DEFAULT_QUERY_LIMIT events across every authorization, newest
   * first.
   */
  async query(
    filter: ExecutionAuditQueryFilter = {},
  ): Promise<readonly StoredExecutionAuditEvent[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.authorizationId !== undefined) {
      values.push(filter.authorizationId);
      conditions.push(`authorization_id = $${values.length}`);
    }

    if (filter.businessTransactionId !== undefined) {
      values.push(filter.businessTransactionId);
      conditions.push(`business_transaction_id = $${values.length}`);
    }

    if (filter.connectorId !== undefined) {
      values.push(filter.connectorId);
      conditions.push(`connector_id = $${values.length}`);
    }

    if (filter.type !== undefined) {
      values.push(filter.type);
      conditions.push(`type = $${values.length}`);
    }

    if (filter.occurredFrom !== undefined) {
      values.push(filter.occurredFrom);
      conditions.push(`occurred_at >= $${values.length}`);
    }

    if (filter.occurredTo !== undefined) {
      values.push(filter.occurredTo);
      conditions.push(`occurred_at <= $${values.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit =
      filter.limit !== undefined && filter.limit > 0
        ? Math.min(filter.limit, DEFAULT_QUERY_LIMIT)
        : DEFAULT_QUERY_LIMIT;

    values.push(limit);

    const { rows } = await this.pool.query<ExecutionAuditEventRow>(
      `SELECT type, occurred_at, connector_id, authorization_id, session_id, action, reason, credential_id, gateway_id, business_transaction_id, chain_hash, previous_chain_hash, chain_position
       FROM execution_audit_events
       ${where}
       ORDER BY id DESC
       LIMIT $${values.length}`,
      values,
    );

    return rows.map((row) => ({
      type: row.type,
      occurredAt: row.occurred_at.toISOString(),
      connectorId: row.connector_id,
      authorizationId: row.authorization_id,
      sessionId: row.session_id,
      ...(row.action !== null ? { action: row.action } : {}),
      ...(row.reason !== null ? { reason: row.reason } : {}),
      ...(row.credential_id !== null
        ? { credentialId: row.credential_id }
        : {}),
      ...(row.gateway_id !== null ? { gatewayId: row.gateway_id } : {}),
      ...(row.business_transaction_id !== null
        ? { businessTransactionId: row.business_transaction_id }
        : {}),
      chainHash: row.chain_hash,
      previousChainHash: row.previous_chain_hash,
      chainPosition: row.chain_position,
    }));
  }
}
