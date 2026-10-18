import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { PostgresPoolFactory } from "@parmana/storage";

import { SupabaseCallerAuditSink } from "../../src/auth/SupabaseCallerAuditSink.js";
import type { CallerAuditEvent } from "../../src/auth/CallerAuditSink.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Supabase Caller Audit Sink");

const SELECT_CALLER_AUDIT_EVENT_BY_ROUTE_SQL = `
  SELECT type, route, caller_id, reason, capability, principal_id, chain_hash, previous_chain_hash, chain_position
  FROM caller_audit_events
  WHERE route = $1
`;

/**
 * Closes G-13 (docs/VERIFICATION-GAPS.md): proves the caller-audit
 * trail is durable against a real database. CallerAuditSink's own
 * interface is write-only (record(): Promise<void>, no read method),
 * so persistence is verified here by querying caller_audit_events
 * directly through the same pool the sink writes through — the same
 * thing an operator investigating an incident after a restart would
 * do. Requires the caller_audit_events table from
 * supabase/migrations/20260718090000_add_nonce_and_caller_audit_
 * tables.sql to have been applied to the target project.
 *
 * Reads via PostgresPoolFactory (DATABASE_URL) now, not a
 * supabase-js/PostgREST client (SUPABASE_URL) — see SupabaseCallerAuditSink
 * for why the writer moved off supabase-js (PostgREST schema-cache
 * workaround, Supabase ticket SU-437429).
 *
 * Also requires supabase/migrations/20260812120000_add_capability_
 * to_caller_audit_events.sql (caller-capability-scoping) to have been
 * applied — the "records a capability_denied event whose capability
 * survives the round trip" case below is the proof that migration
 * actually landed, not just that the code compiles against it.
 *
 * Also requires supabase/migrations/20260816120000_add_principal_
 * to_caller_audit_events.sql (caller-principal-scoping) to have been
 * applied — the "records a principal_denied event whose principalId
 * survives the round trip" case below is that migration's own proof.
 */
describe.skipIf(!databaseConfigured)("SupabaseCallerAuditSink (live)", () => {
  it("records an event that a fresh pool against the same backing can read back", async () => {
    const route = `/test-${crypto.randomUUID()}`;

    const event: CallerAuditEvent = {
      type: "caller.authenticated",
      occurredAt: new Date().toISOString(),
      route,
      callerId: "integration-test-caller",
    };

    const sink = new SupabaseCallerAuditSink(PostgresPoolFactory.create());

    await sink.record(event);

    // A fresh pool, standing in for a fresh process — proves the row
    // survives independently of the writer's own pool/process.
    const readingPool = PostgresPoolFactory.create();

    const { rows } = await readingPool.query(
      SELECT_CALLER_AUDIT_EVENT_BY_ROUTE_SQL,
      [route],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("caller.authenticated");
    expect(rows[0].route).toBe(route);
    expect(rows[0].caller_id).toBe("integration-test-caller");
    expect(rows[0].reason).toBeNull();
    expect(rows[0].chain_hash).not.toBeNull();
    expect(rows[0].previous_chain_hash).toBeNull();
    expect(Number(rows[0].chain_position)).toBeGreaterThanOrEqual(1);
  });

  it("chains a second event from the same caller against a real Postgres advisory lock", async () => {
    const routeOne = `/test-${crypto.randomUUID()}`;
    const routeTwo = `/test-${crypto.randomUUID()}`;
    const callerId = `integration-test-caller-chain-${crypto.randomUUID()}`;

    const sink = new SupabaseCallerAuditSink(PostgresPoolFactory.create());

    await sink.record({
      type: "caller.authenticated",
      occurredAt: new Date().toISOString(),
      route: routeOne,
      callerId,
    });

    await sink.record({
      type: "caller.authenticated",
      occurredAt: new Date().toISOString(),
      route: routeTwo,
      callerId,
    });

    const readingPool = PostgresPoolFactory.create();

    const first = await readingPool.query(
      SELECT_CALLER_AUDIT_EVENT_BY_ROUTE_SQL,
      [routeOne],
    );
    const second = await readingPool.query(
      SELECT_CALLER_AUDIT_EVENT_BY_ROUTE_SQL,
      [routeTwo],
    );

    expect(first.rows[0].previous_chain_hash).toBeNull();
    expect(second.rows[0].previous_chain_hash).toBe(first.rows[0].chain_hash);
    expect(Number(second.rows[0].chain_position)).toBe(
      Number(first.rows[0].chain_position) + 1,
    );
  });

  it("records a rejected event with a reason and a null callerId", async () => {
    const route = `/test-${crypto.randomUUID()}`;

    const event: CallerAuditEvent = {
      type: "caller.rejected",
      occurredAt: new Date().toISOString(),
      route,
      reason: "missing credential",
    };

    const sink = new SupabaseCallerAuditSink(PostgresPoolFactory.create());

    await sink.record(event);

    const readingPool = PostgresPoolFactory.create();

    const { rows } = await readingPool.query(
      SELECT_CALLER_AUDIT_EVENT_BY_ROUTE_SQL,
      [route],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("caller.rejected");
    expect(rows[0].caller_id).toBeNull();
    expect(rows[0].reason).toBe("missing credential");
    expect(rows[0].capability).toBeNull();
  });

  it("records a capability_denied event whose capability survives the round trip", async () => {
    const route = `/test-${crypto.randomUUID()}`;

    const event: CallerAuditEvent = {
      type: "caller.capability_denied",
      occurredAt: new Date().toISOString(),
      route,
      callerId: "integration-test-caller",
      capability: "hubspot:deal-update",
      reason: "capability not allowed",
    };

    const sink = new SupabaseCallerAuditSink(PostgresPoolFactory.create());

    await sink.record(event);

    const readingPool = PostgresPoolFactory.create();

    const { rows } = await readingPool.query(
      SELECT_CALLER_AUDIT_EVENT_BY_ROUTE_SQL,
      [route],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("caller.capability_denied");
    expect(rows[0].caller_id).toBe("integration-test-caller");
    expect(rows[0].capability).toBe("hubspot:deal-update");
    expect(rows[0].reason).toBe("capability not allowed");
  });

  it("records a principal_denied event whose principalId survives the round trip", async () => {
    const route = `/test-${crypto.randomUUID()}`;

    const event: CallerAuditEvent = {
      type: "caller.principal_denied",
      occurredAt: new Date().toISOString(),
      route,
      callerId: "integration-test-caller",
      principalId: "someone-else",
      reason: "principal not allowed",
    };

    const sink = new SupabaseCallerAuditSink(PostgresPoolFactory.create());

    await sink.record(event);

    const readingPool = PostgresPoolFactory.create();

    const { rows } = await readingPool.query(
      SELECT_CALLER_AUDIT_EVENT_BY_ROUTE_SQL,
      [route],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("caller.principal_denied");
    expect(rows[0].caller_id).toBe("integration-test-caller");
    expect(rows[0].principal_id).toBe("someone-else");
    expect(rows[0].reason).toBe("principal not allowed");
  });
});
