import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PostgresExecutionAuditSink,
  PostgresPoolFactory,
} from "@parmana/storage";

import { PostgresCallerAuditSink } from "../../src/auth/PostgresCallerAuditSink.js";
import type { CallerAuditEvent } from "../../src/auth/CallerAuditSink.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * ADR-0021, step 4: evidence tables are append-only, enforced by the database
 * (migration 20261110120000_enforce_append_only_evidence.sql).
 *
 * Runs against a database built from the repository migrations. Each rejected
 * statement must fail with the append-only error, and the row must still be
 * there afterwards. The TRUNCATE check runs in a transaction that is rolled
 * back, so a missing trigger cannot empty the database.
 */
const databaseConfigured = resolveDatabaseGate("Evidence append-only");

const EVIDENCE_TABLES = [
  "caller_audit_events",
  "execution_audit_events",
  "policy_change_approval_records",
  "refusal_records",
] as const;

const APPEND_ONLY = /is append-only/;

describe.skipIf(!databaseConfigured)(
  "evidence tables are append-only (live)",
  () => {
    it("installs a row trigger and a truncate trigger on every evidence table", async () => {
      const pool = PostgresPoolFactory.create();

      const { rows } = await pool.query<{
        table_name: string;
        trigger_name: string;
      }>(
        `SELECT c.relname AS table_name, t.tgname AS trigger_name
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal
          AND t.tgname LIKE '%append_only%'`,
      );

      for (const table of EVIDENCE_TABLES) {
        expect(rows.map((r) => r.trigger_name)).toEqual(
          expect.arrayContaining([
            `${table}_append_only_row`,
            `${table}_append_only_truncate`,
          ]),
        );
      }
    });

    it("rejects UPDATE and DELETE on a caller audit row, and keeps the row", async () => {
      const pool = PostgresPoolFactory.create();
      const route = `/append-only-${crypto.randomUUID()}`;

      const event: CallerAuditEvent = {
        type: "caller.authenticated",
        occurredAt: new Date().toISOString(),
        route,
        callerId: "append-only-test-caller",
      };
      await new PostgresCallerAuditSink(pool).record(event);

      await expect(
        pool.query(
          "UPDATE caller_audit_events SET reason = 'tampered' WHERE route = $1",
          [route],
        ),
      ).rejects.toThrow(APPEND_ONLY);

      await expect(
        pool.query("DELETE FROM caller_audit_events WHERE route = $1", [route]),
      ).rejects.toThrow(APPEND_ONLY);

      const { rows } = await pool.query(
        "SELECT reason FROM caller_audit_events WHERE route = $1",
        [route],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBeNull();
    });

    it("rejects UPDATE on an execution audit row", async () => {
      const pool = PostgresPoolFactory.create();
      const authorizationId = `append-only-${crypto.randomUUID()}`;

      await new PostgresExecutionAuditSink(pool).record({
        type: "session.created",
        occurredAt: new Date().toISOString(),
        connectorId: "append-only-connector",
        authorizationId,
        sessionId: "append-only-session",
        action: "append-only:action",
      });

      await expect(
        pool.query(
          "UPDATE execution_audit_events SET reason = 'tampered' WHERE authorization_id = $1",
          [authorizationId],
        ),
      ).rejects.toThrow(APPEND_ONLY);
    });

    it("refuses TRUNCATE on every evidence table", async () => {
      const pool = PostgresPoolFactory.create();

      for (const table of EVIDENCE_TABLES) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await expect(client.query(`TRUNCATE ${table}`)).rejects.toThrow(
            APPEND_ONLY,
          );
        } finally {
          await client.query("ROLLBACK");
          client.release();
        }
      }
    });
  },
);
