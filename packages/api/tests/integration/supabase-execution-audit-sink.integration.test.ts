import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PostgresPoolFactory,
  SupabaseExecutionAuditSink,
} from "@parmana/storage";
import type { ExecutionAuditEvent } from "@parmana/execution-control";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Supabase Execution Audit Sink");

const SELECT_EXECUTION_AUDIT_EVENT_BY_SESSION_SQL = `
  SELECT type, connector_id, authorization_id, session_id, action, reason, chain_hash, previous_chain_hash, chain_position
  FROM execution_audit_events
  WHERE session_id = $1
  ORDER BY id ASC
`;

/**
 * Closes GAP-1 (GAPS.md 2026-09-14): proves the execution-audit trail
 * is durable against a real database, and that a regulator/operator
 * lookup ("show me everything for this authorization") retrieves the
 * complete, correctly-ordered chain back out — not just that a row
 * landed. Mirrors supabase-caller-audit-sink.integration.test.ts's own
 * shape and live/opt-in gating exactly.
 *
 * Requires the execution_audit_events table from
 * supabase/migrations/20260914120000_add_execution_audit_events.sql to
 * have been applied to the target project.
 */
describe.skipIf(!databaseConfigured)(
  "SupabaseExecutionAuditSink (live)",
  () => {
    it("records an event that a fresh pool against the same backing can read back", async () => {
      const sessionId = `session-${crypto.randomUUID()}`;
      const authorizationId = `auth-${crypto.randomUUID()}`;

      const event: ExecutionAuditEvent = {
        type: "session.created",
        occurredAt: new Date().toISOString(),
        connectorId: "paytm",
        authorizationId,
        sessionId,
        action: "paytm:refund",
      };

      const sink = new SupabaseExecutionAuditSink(PostgresPoolFactory.create());

      await sink.record(event);

      // A fresh pool, standing in for a fresh process -- proves the row
      // survives independently of the writer's own pool/process.
      const readingPool = PostgresPoolFactory.create();

      const { rows } = await readingPool.query(
        SELECT_EXECUTION_AUDIT_EVENT_BY_SESSION_SQL,
        [sessionId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("session.created");
      expect(rows[0].authorization_id).toBe(authorizationId);
      expect(rows[0].action).toBe("paytm:refund");
      expect(rows[0].reason).toBeNull();
      expect(rows[0].chain_hash).not.toBeNull();
      expect(rows[0].previous_chain_hash).toBeNull();
      expect(Number(rows[0].chain_position)).toBe(1);
    });

    it("Execute -> Query audit -> Retrieve complete chain: session.created then execution.completed for the same authorization chain together, in order, and query() returns exactly that chain", async () => {
      const authorizationId = `auth-${crypto.randomUUID()}`;
      const sessionId = `session-${crypto.randomUUID()}`;

      const sink = new SupabaseExecutionAuditSink(PostgresPoolFactory.create());

      await sink.record({
        type: "session.created",
        occurredAt: new Date().toISOString(),
        connectorId: "paytm",
        authorizationId,
        sessionId,
        action: "paytm:refund",
      });

      await sink.record({
        type: "execution.completed",
        occurredAt: new Date().toISOString(),
        connectorId: "paytm",
        authorizationId,
        sessionId,
        action: "paytm:refund",
      });

      // A regulator/operator asking "show me everything that happened
      // for this authorization" -- the exact query GAP-1 exists to make
      // possible -- via a fresh sink instance and a fresh pool.
      const queryingSink = new SupabaseExecutionAuditSink(
        PostgresPoolFactory.create(),
      );

      const chain = await queryingSink.query({ authorizationId });

      expect(chain).toHaveLength(2);

      // query() orders newest-first.
      expect(chain[0]!.type).toBe("execution.completed");
      expect(chain[1]!.type).toBe("session.created");

      expect(chain[1]!.chainPosition).toBe(1);
      expect(chain[1]!.previousChainHash).toBeNull();

      expect(chain[0]!.chainPosition).toBe(2);
      expect(chain[0]!.previousChainHash).toBe(chain[1]!.chainHash);

      expect(
        chain.every((event) => event.authorizationId === authorizationId),
      ).toBe(true);
    });

    it("records an execution.rejected event with its reason, chained after the authorization's session.created event", async () => {
      const authorizationId = `auth-${crypto.randomUUID()}`;
      const sessionId = `session-${crypto.randomUUID()}`;

      const sink = new SupabaseExecutionAuditSink(PostgresPoolFactory.create());

      await sink.record({
        type: "session.created",
        occurredAt: new Date().toISOString(),
        connectorId: "paytm",
        authorizationId,
        sessionId,
        action: "paytm:refund",
      });

      await sink.record({
        type: "execution.rejected",
        occurredAt: new Date().toISOString(),
        connectorId: "paytm",
        authorizationId,
        sessionId,
        action: "paytm:refund",
        reason: "PaytmConnector request timed out after 10000ms.",
      });

      const readingPool = PostgresPoolFactory.create();

      const { rows } = await readingPool.query(
        SELECT_EXECUTION_AUDIT_EVENT_BY_SESSION_SQL,
        [sessionId],
      );

      expect(rows).toHaveLength(2);
      expect(rows[1].type).toBe("execution.rejected");
      expect(rows[1].reason).toBe(
        "PaytmConnector request timed out after 10000ms.",
      );
      expect(rows[1].previous_chain_hash).toBe(rows[0].chain_hash);
      expect(Number(rows[1].chain_position)).toBe(
        Number(rows[0].chain_position) + 1,
      );
    });

    it("gives two different authorizations independent chains against a real Postgres advisory lock", async () => {
      const authOne = `auth-${crypto.randomUUID()}`;
      const authTwo = `auth-${crypto.randomUUID()}`;
      const sessionOne = `session-${crypto.randomUUID()}`;
      const sessionTwo = `session-${crypto.randomUUID()}`;

      const sink = new SupabaseExecutionAuditSink(PostgresPoolFactory.create());

      await sink.record({
        type: "session.created",
        occurredAt: new Date().toISOString(),
        connectorId: "paytm",
        authorizationId: authOne,
        sessionId: sessionOne,
      });

      await sink.record({
        type: "session.created",
        occurredAt: new Date().toISOString(),
        connectorId: "paytm",
        authorizationId: authTwo,
        sessionId: sessionTwo,
      });

      const readingPool = PostgresPoolFactory.create();

      const first = await readingPool.query(
        SELECT_EXECUTION_AUDIT_EVENT_BY_SESSION_SQL,
        [sessionOne],
      );
      const second = await readingPool.query(
        SELECT_EXECUTION_AUDIT_EVENT_BY_SESSION_SQL,
        [sessionTwo],
      );

      expect(Number(first.rows[0].chain_position)).toBe(1);
      expect(Number(second.rows[0].chain_position)).toBe(1);
      expect(first.rows[0].previous_chain_hash).toBeNull();
      expect(second.rows[0].previous_chain_hash).toBeNull();
      expect(first.rows[0].chain_hash).not.toBe(second.rows[0].chain_hash);
    });
  },
);
