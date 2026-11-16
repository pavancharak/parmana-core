import crypto from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ApprovalNonceAlreadyConsumedError,
  type AppendTransactionStatusEvent,
} from "@parmana/shared";

import { PostgresApprovalNonceStore } from "../../src/postgres/PostgresApprovalNonceStore.js";
import { PostgresTransactionStatusEventRepository } from "../../src/postgres/PostgresTransactionStatusEventRepository.js";

import { insertBusinessTransaction } from "../helpers/business-transaction-fixture.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with migrations applied (consumed_approval_nonces and the status events).
 * Writes rows it does not delete. Never point it at production.
 */
const databaseConfigured = resolveDatabaseGate(
  "Approval nonce consumption with the status event",
);

const EXPIRES = "2099-01-01T00:00:00.000Z";

describe.skipIf(!databaseConfigured)(
  "approval nonces are consumed with the APPROVED event, on Postgres (D24)",
  () => {
    let pool: Pool;
    let events: PostgresTransactionStatusEventRepository;
    let nonces: PostgresApprovalNonceStore;

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      events = new PostgresTransactionStatusEventRepository(pool);
      nonces = new PostgresApprovalNonceStore(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    async function newTransactionAtPolicyEvaluated(): Promise<string> {
      const id = `approval-live-${crypto.randomUUID()}`;
      await insertBusinessTransaction(pool, id);
      const step = (
        from: AppendTransactionStatusEvent["from"],
        to: AppendTransactionStatusEvent["to"],
        stage: AppendTransactionStatusEvent["stage"],
      ): AppendTransactionStatusEvent => ({
        eventId: crypto.randomUUID(),
        businessTransactionId: id,
        from,
        to,
        stage,
        occurredAt: new Date(),
      });
      await events.append(step(null, "RECEIVED", "declare"));
      await events.append(step("RECEIVED", "POLICY_EVALUATED", "decide"));
      return id;
    }

    function approved(
      id: string,
      consumeApprovalNonces: AppendTransactionStatusEvent["consumeApprovalNonces"],
    ): AppendTransactionStatusEvent {
      return {
        eventId: crypto.randomUUID(),
        businessTransactionId: id,
        from: "POLICY_EVALUATED",
        to: "APPROVED",
        stage: "decide",
        occurredAt: new Date(),
        consumeApprovalNonces,
      };
    }

    it("records the nonce in the same transaction as the APPROVED event", async () => {
      const id = await newTransactionAtPolicyEvaluated();
      const nonce = `nonce-${crypto.randomUUID()}`;

      await events.append(approved(id, [{ nonce, expiresAt: EXPIRES }]));

      expect(await nonces.isConsumed(nonce)).toBe(true);
      expect((await events.current(id))?.status).toBe("APPROVED");
    }, 60000);

    it("refuses a second transaction that reuses the nonce, and rolls its APPROVED write back", async () => {
      const nonce = `nonce-${crypto.randomUUID()}`;
      const first = await newTransactionAtPolicyEvaluated();
      await events.append(approved(first, [{ nonce, expiresAt: EXPIRES }]));

      const second = await newTransactionAtPolicyEvaluated();
      await expect(
        events.append(approved(second, [{ nonce, expiresAt: EXPIRES }])),
      ).rejects.toBeInstanceOf(ApprovalNonceAlreadyConsumedError);

      // The second transaction is still POLICY_EVALUATED: its APPROVED event was rolled back with the nonce insert.
      expect((await events.current(second))?.status).toBe("POLICY_EVALUATED");
    }, 60000);

    it("records none of a list of nonces when one of them is already consumed", async () => {
      const taken = `nonce-${crypto.randomUUID()}`;
      const fresh = `nonce-${crypto.randomUUID()}`;
      const holder = await newTransactionAtPolicyEvaluated();
      await events.append(
        approved(holder, [{ nonce: taken, expiresAt: EXPIRES }]),
      );

      const id = await newTransactionAtPolicyEvaluated();
      await expect(
        events.append(
          approved(id, [
            { nonce: fresh, expiresAt: EXPIRES },
            { nonce: taken, expiresAt: EXPIRES },
          ]),
        ),
      ).rejects.toBeInstanceOf(ApprovalNonceAlreadyConsumedError);

      expect(await nonces.isConsumed(fresh)).toBe(false);
      expect((await events.current(id))?.status).toBe("POLICY_EVALUATED");
    }, 60000);
  },
);
