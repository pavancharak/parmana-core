import crypto from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DuplicateBusinessTransactionError,
  type AppendTransactionStatusEvent,
  type BusinessTransaction,
} from "@parmana/shared";

import { PostgresTransactionDeclarationStore } from "../../src/postgres/PostgresTransactionDeclarationStore.js";
import { PostgresTransactionExecutionLock } from "../../src/postgres/PostgresTransactionExecutionLock.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with the status events migration applied, and a
 * business_transactions table with the columns the insert writes. Never point
 * it at production: it writes rows it does not delete.
 */
const databaseConfigured = resolveDatabaseGate(
  "Declaration store and execution lock",
);

describe.skipIf(!databaseConfigured)(
  "Postgres declaration store and execution lock (live)",
  () => {
    let pool: Pool;
    let declarations: PostgresTransactionDeclarationStore;
    let locks: PostgresTransactionExecutionLock;

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      declarations = new PostgresTransactionDeclarationStore(pool);
      locks = new PostgresTransactionExecutionLock(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    function transaction(id: string): BusinessTransaction {
      return {
        businessTransactionId: id,
        status: "RECEIVED",
        authority: { authorityId: "a" },
        authorization: { authorizationId: "z" },
        intent: { intentId: "i" },
        metadata: { businessTransactionId: id },
        policy: { name: "p", version: "1" },
        signals: {},
        createdAt: new Date("2026-11-15T10:00:00Z"),
      } as unknown as BusinessTransaction;
    }

    function received(
      id: string,
      occurredAt = new Date("2026-11-15T10:00:00Z"),
    ): AppendTransactionStatusEvent {
      return {
        eventId: crypto.randomUUID(),
        businessTransactionId: id,
        from: null,
        to: "RECEIVED",
        stage: "declare",
        occurredAt,
      };
    }

    async function counts(id: string) {
      const tx = await pool.query(
        "SELECT count(*)::int AS n FROM business_transactions WHERE business_transaction_id = $1",
        [id],
      );
      const ev = await pool.query(
        "SELECT count(*)::int AS n FROM transaction_status_events WHERE business_transaction_id = $1",
        [id],
      );
      return {
        transactions: tx.rows[0].n as number,
        events: ev.rows[0].n as number,
      };
    }

    it("stores the transaction and its RECEIVED event together", async () => {
      const id = crypto.randomUUID();
      await declarations.declare(transaction(id), received(id));

      expect(await counts(id)).toEqual({ transactions: 1, events: 1 });
      const row = await pool.query(
        "SELECT status, sequence FROM transaction_status_events WHERE business_transaction_id = $1",
        [id],
      );
      expect(row.rows[0]).toMatchObject({ status: "RECEIVED", sequence: "1" });
    });

    it("stores neither when the event cannot be written (the transaction is rolled back)", async () => {
      const id = crypto.randomUUID();
      await expect(
        declarations.declare(
          transaction(id),
          received(id, new Date(Number.NaN)),
        ),
      ).rejects.toThrow();

      expect(await counts(id)).toEqual({ transactions: 0, events: 0 });
    });

    it("refuses a duplicate, and keeps one transaction and one event", async () => {
      const id = crypto.randomUUID();
      await declarations.declare(transaction(id), received(id));

      await expect(
        declarations.declare(transaction(id), received(id)),
      ).rejects.toBeInstanceOf(DuplicateBusinessTransactionError);
      expect(await counts(id)).toEqual({ transactions: 1, events: 1 });
    });

    it("lets one holder in, refuses a second until the first releases, then admits it", async () => {
      const id = crypto.randomUUID();

      const first = await locks.acquire(id, 200);
      expect(first).not.toBeNull();

      const started = Date.now();
      expect(await locks.acquire(id, 150)).toBeNull();
      expect(Date.now() - started).toBeGreaterThanOrEqual(140);

      await first!.release();
      const second = await locks.acquire(id, 200);
      expect(second).not.toBeNull();
      await second!.release();
    });
  },
);
