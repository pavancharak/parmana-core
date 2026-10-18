import type { Pool, PoolClient } from "pg";

import {
  AuditEventCrypto,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";
import type { Signature } from "@parmana/shared";

import type { CallerAuditEvent, CallerAuditSink } from "./CallerAuditSink.js";

/**
 * Durable, Supabase-backed CallerAuditSink. Closes G-13
 * (docs/VERIFICATION-GAPS.md) for the caller-authentication audit
 * trail: events now survive a process restart instead of living only
 * in InMemoryCallerAuditSink's process-local array (still the correct
 * choice for tests — see
 * packages/api/src/bootstrap/createCallerAuditSink.js).
 *
 * Signed at write time (audit-sink signing milestone, following
 * RFC-0021's Refusal Records): a plain durable row could previously
 * be altered by anyone with database access with no way to detect
 * it. Signs the event exactly as given, before any storage-only
 * field (insert timestamp, row id) is added — the same discipline
 * VerificationCrypto/RefusalCrypto already apply. Uses the same
 * signing stack and key (DEFAULT_KEY_ID) as every other signed
 * artifact in this codebase; see AuditEventCrypto.
 *
 * Failure semantics: unchanged from InMemoryCallerAuditSink. record()
 * has always been an unguarded `await` in
 * middleware/caller-auth.ts — that call site has no try/catch today,
 * and this class does not add one. A write failure here rejects the
 * returned promise exactly like any other failed Supabase insert
 * elsewhere in this codebase (SupabaseBusinessTransactionRepository,
 * SupabaseExecutionTrustRecordRepository); it is the caller's
 * existing behavior, unmodified by this class, that decides what
 * happens next. See docs/VERIFICATION-GAPS.md G-13 for why this is
 * documented rather than changed in this session.
 *
 * CallerAuditEvent.capability (caller-capability-scoping milestone,
 * supabase/migrations/20260812120000_add_capability_to_caller_audit_
 * events.sql), CallerAuditEvent.principalId (caller-principal-
 * scoping milestone, supabase/migrations/20260816120000_add_principal_
 * to_caller_audit_events.sql), CallerAuditEvent.severity (policy-
 * governance milestone, supabase/migrations/20260818130000_add_non_
 * human_denied_to_caller_audit_events.sql), and
 * CallerAuditEvent.businessTransactionId (G-29, structural-validation
 * audit milestone, supabase/migrations/20260824090000_add_structural_
 * rejected_to_caller_audit_events.sql) are each signed as part of
 * the event (this.crypto.sign(event) below covers the full object)
 * and written to their own nullable column here, the same as every
 * other optional field — null on events that don't concern a specific
 * capability, principal, elevated-severity outcome, or structural
 * rejection (caller.authenticated, caller.rejected).
 *
 * TEMPORARY WORKAROUND: writes via a direct Postgres connection (see
 * PostgresPoolFactory), not supabase-js — PostgREST's schema cache is
 * stuck refusing to see signature_json on this table (Supabase ticket
 * SU-437429), confirmed at Supabase's PostgREST layer specifically,
 * not the database or this codebase. Raw SQL bypasses PostgREST's
 * REST layer (and its schema cache) entirely. Revert to supabase-js
 * (`this.client.from("caller_audit_events").insert(...)`, as before)
 * once Supabase confirms the cache issue is resolved.
 *
 * Per-caller chain (regulatory-evidence gap: a deleted row was
 * previously undetectable, see docs/site/trust-and-claims/objections-
 * and-evidence.mdx). Every event carrying a callerId is chained to
 * that caller's own immediately-preceding event: previousChainHash
 * (that prior event's chainHash, or null for the caller's first
 * event) and chainPosition (a 1-based per-caller sequence number) are
 * folded into the exact object this.crypto.sign() signs — the
 * existing signature_json column already covers the chain link, no
 * second signature column needed. chainHash is a TrustRecordHasher
 * hash of that same signed content, the identical idiom RuntimeEngine
 * already uses for policyContentHash/signalsHash.
 *
 * Deliberately NOT a single global chain: caller.authenticated fires
 * on every authenticated request to every route — the highest-write-
 * volume table in this system. A global chain needs a lock
 * serializing every write through one predecessor lookup. Per-caller
 * chaining instead takes a Postgres advisory transaction lock scoped
 * to hashtext(callerId) — it only serializes a caller against their
 * own concurrent requests, never against a different caller's.
 *
 * Events with no callerId (the earliest possible rejection — malformed
 * JSON/oversized body, rejected before caller-auth middleware or any
 * route handler runs — and caller.rejected, no caller identified) get
 * NULL chain_hash/previous_chain_hash/chain_position: there is no
 * per-caller chain to link them into, the same "absent means not
 * covered" discipline every other optional field on this table
 * already follows.
 */
const INSERT_CALLER_AUDIT_EVENT_SQL = `
  INSERT INTO caller_audit_events
    (type, occurred_at, route, caller_id, reason, capability, principal_id, severity, business_transaction_id, signature_json, chain_hash, previous_chain_hash, chain_position)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
`;

const LAST_CALLER_CHAIN_LINK_SQL = `
  SELECT chain_hash, chain_position
  FROM caller_audit_events
  WHERE caller_id = $1
  ORDER BY id DESC
  LIMIT 1
`;

interface LastChainLinkRow {
  readonly chain_hash: string | null;
  readonly chain_position: string | null;
}

export class SupabaseCallerAuditSink implements CallerAuditSink {
  private readonly crypto = new AuditEventCrypto();

  private readonly chainHasher = new TrustRecordHasher(
    CryptoBootstrap.create(),
  );

  constructor(private readonly pool: Pool) {}

  async record(event: CallerAuditEvent): Promise<void> {
    if (event.callerId === undefined) {
      const signature = await this.crypto.sign(event);

      await this.insertRow(this.pool, event, signature, null, null, null);
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        event.callerId,
      ]);

      const { rows } = await client.query<LastChainLinkRow>(
        LAST_CALLER_CHAIN_LINK_SQL,
        [event.callerId],
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

      await this.insertRow(
        client,
        event,
        signature,
        chainHash,
        previousChainHash,
        chainPosition,
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertRow(
    queryable: Pool | PoolClient,
    event: CallerAuditEvent,
    signature: Signature,
    chainHash: string | null,
    previousChainHash: string | null,
    chainPosition: number | null,
  ): Promise<void> {
    await queryable.query(INSERT_CALLER_AUDIT_EVENT_SQL, [
      event.type,
      event.occurredAt,
      event.route,
      event.callerId ?? null,
      event.reason ?? null,
      event.capability ?? null,
      event.principalId ?? null,
      event.severity ?? null,
      event.businessTransactionId ?? null,
      JSON.stringify(signature),
      chainHash,
      previousChainHash,
      chainPosition,
    ]);
  }
}
