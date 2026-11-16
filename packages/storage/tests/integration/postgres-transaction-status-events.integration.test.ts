import crypto from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BusinessTransactionNotFoundError,
  InvalidStatusTransitionError,
  type TransactionStatusStage,
} from "@parmana/shared";

import { PostgresTransactionStatusEventRepository } from "../../src/postgres/PostgresTransactionStatusEventRepository.js";

import { insertBusinessTransaction } from "../helpers/business-transaction-fixture.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with migration 20261115140000 applied.
 * Writes rows it does not delete. Never point it at production.
 */
const databaseConfigured = resolveDatabaseGate(
  "Transaction Status Event Repository",
);

describe.skipIf(!databaseConfigured)(
  "PostgresTransactionStatusEventRepository (live)",
  () => {
    let pool: Pool;
    let repository: PostgresTransactionStatusEventRepository;

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      repository = new PostgresTransactionStatusEventRepository(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    async function newTransaction(): Promise<string> {
      const id = `status-live-${crypto.randomUUID()}`;
      await insertBusinessTransaction(pool, id);
      return id;
    }

    function step(
      businessTransactionId: string,
      from: "RECEIVED" | "POLICY_EVALUATED" | "APPROVED" | "EXECUTING" | null,
      to: "RECEIVED" | "POLICY_EVALUATED" | "APPROVED" | "EXECUTING",
      stage: TransactionStatusStage,
      reason?: string,
    ) {
      return {
        eventId: crypto.randomUUID(),
        businessTransactionId,
        from,
        to,
        stage,
        occurredAt: new Date(),
        ...(reason !== undefined && { reason }),
      };
    }

    it("writes a happy path with sequences 1..n and reads the current status", async () => {
      const id = await newTransaction();
      await repository.append(step(id, null, "RECEIVED", "declare"));
      await repository.append(
        step(id, "RECEIVED", "POLICY_EVALUATED", "decide"),
      );
      await repository.append(
        step(id, "POLICY_EVALUATED", "APPROVED", "decide"),
      );

      const history = await repository.history(id);
      expect(history.map((e) => e.sequence)).toEqual([1, 2, 3]);
      expect(history.map((e) => e.status)).toEqual([
        "RECEIVED",
        "POLICY_EVALUATED",
        "APPROVED",
      ]);
      expect((await repository.current(id))?.status).toBe("APPROVED");
    });

    it("lets exactly one of two concurrent writers win the same transition", async () => {
      const id = await newTransaction();
      await repository.append(step(id, null, "RECEIVED", "declare"));

      const results = await Promise.allSettled([
        repository.append(step(id, "RECEIVED", "POLICY_EVALUATED", "decide")),
        repository.append(step(id, "RECEIVED", "POLICY_EVALUATED", "decide")),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(InvalidStatusTransitionError);

      const history = await repository.history(id);
      expect(history.map((e) => e.sequence)).toEqual([1, 2]);
    });

    it("refuses a move the transition table does not allow and writes nothing", async () => {
      const id = await newTransaction();
      await repository.append(step(id, null, "RECEIVED", "declare"));

      await expect(
        repository.append(step(id, "RECEIVED", "EXECUTING", "execute")),
      ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
      expect((await repository.history(id)).length).toBe(1);
    });

    it("refuses an event for a transaction that does not exist", async () => {
      await expect(
        repository.append(
          step(`missing-${crypto.randomUUID()}`, null, "RECEIVED", "declare"),
        ),
      ).rejects.toBeInstanceOf(BusinessTransactionNotFoundError);
    });

    it("refuses a FAILED event written without a reason (database check)", async () => {
      const id = await newTransaction();
      await repository.append(step(id, null, "RECEIVED", "declare"));
      await repository.append(
        step(id, "RECEIVED", "POLICY_EVALUATED", "decide"),
      );
      await repository.append(
        step(id, "POLICY_EVALUATED", "APPROVED", "decide"),
      );
      await repository.append(step(id, "APPROVED", "EXECUTING", "execute"));

      await expect(
        pool.query(
          `INSERT INTO transaction_status_events
             (event_id, business_transaction_id, sequence, status, stage, occurred_at, legacy)
           VALUES ($1, $2, 99, 'FAILED', 'execute', now(), false)`,
          [crypto.randomUUID(), id],
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it("refuses UPDATE, DELETE and TRUNCATE on the table", async () => {
      const id = await newTransaction();
      await repository.append(step(id, null, "RECEIVED", "declare"));

      await expect(
        pool.query(
          "UPDATE transaction_status_events SET status = 'VERIFIED' WHERE business_transaction_id = $1",
          [id],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        pool.query(
          "DELETE FROM transaction_status_events WHERE business_transaction_id = $1",
          [id],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        pool.query("TRUNCATE transaction_status_events"),
      ).rejects.toThrow(/append-only/);
    });
  },
);
