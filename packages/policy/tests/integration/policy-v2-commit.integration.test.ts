import { Pool } from "pg";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveDatabaseGate } from "../../../../test-support/database-gate.js";
import {
  acquirePolicyV2SuiteLock,
  releasePolicyV2SuiteLock,
} from "../helpers/policy-v2-database-lock.js";
import { EvidenceLog, type EvidenceRecord } from "../../src/v2/evidence.js";
import {
  PersistenceConflictError,
  PolicyV2Store,
} from "../../src/v2/persistence.js";

/**
 * A decision's evidence and its review state are committed in one transaction, against a real
 * database. Either all of them are written, or none is.
 */

const databaseConfigured = resolveDatabaseGate("Policy v2 commit");
const NOW = "2026-11-18T09:00:00.000Z";

function recordFor(id: string, log: EvidenceLog): EvidenceRecord {
  return log.append({
    recordId: id,
    decidedAt: NOW,
    request: {
      capability: "erp:pay-invoice",
      transactionId: id,
      target: "INV-1",
      parameters: {},
      signals: {},
    },
    policyHash: "a".repeat(64),
    decision: {
      outcome: "REVIEW",
      reason: "needs a person",
      policy: { capability: "erp:pay-invoice", hash: "a".repeat(64) },
      values: {},
    },
    inputs: { answers: {}, approvals: {} },
    snapshot: {
      sources: [],
      approvers: [],
      registerView: { sources: {} },
      thresholds: {},
    },
  });
}

describe.skipIf(!databaseConfigured)(
  "policy v2 decision commit (live database)",
  () => {
    let pool: Pool;
    let store: PolicyV2Store;
    let lock: PoolClient | undefined;

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      lock = await acquirePolicyV2SuiteLock(pool);
      store = new PolicyV2Store(pool);
    });

    beforeEach(async () => {
      await pool.query("TRUNCATE policy_v2_state, policy_v2_evidence");
    });

    afterAll(async () => {
      await releasePolicyV2SuiteLock(lock!);
      await pool.end();
    });

    it("writes the evidence and the review state together", async () => {
      const log = new EvidenceLog();
      await store.commitDecision({
        record: recordFor("ev-1", log),
        review: { body: { items: [] }, readVersion: 0 },
        alerts: { body: { alerts: [] }, readVersion: 0 },
      });
      expect(await store.readEvidence()).toHaveLength(1);
      expect((await store.load("review"))?.version).toBe(1);
      expect((await store.load("alerts"))?.version).toBe(1);
    });

    it("writes neither the evidence nor the alerts when the review version is stale", async () => {
      const log = new EvidenceLog();
      await store.save("review", { items: [] }, 0);
      await expect(
        store.commitDecision({
          record: recordFor("ev-1", log),
          review: { body: { items: [{ id: "review-1" }] }, readVersion: 0 },
          alerts: { body: { alerts: [{ id: "alert-1" }] }, readVersion: 0 },
        }),
      ).rejects.toBeInstanceOf(PersistenceConflictError);
      expect(await store.readEvidence()).toHaveLength(0);
      expect(await store.load("alerts")).toBeUndefined();
      expect(
        (await store.load<{ items: unknown[] }>("review"))!.body.items,
      ).toEqual([]);
    });

    it("writes nothing when the record does not link to the last stored record", async () => {
      const log = new EvidenceLog();
      await store.commitDecision({ record: recordFor("ev-1", log) });
      const stale = new EvidenceLog();
      await expect(
        store.commitDecision({
          record: recordFor("ev-2", stale),
          review: { body: { items: [{ id: "review-1" }] }, readVersion: 0 },
        }),
      ).rejects.toBeInstanceOf(PersistenceConflictError);
      expect(await store.readEvidence()).toHaveLength(1);
      expect(await store.load("review")).toBeUndefined();
    });

    it("writes neither snapshot when the alert version is stale", async () => {
      await store.save("review", { items: [] }, 0);
      await store.save("alerts", { alerts: [] }, 0);
      await expect(
        store.commitSnapshots({
          review: { body: { items: [{ id: "review-1" }] }, readVersion: 1 },
          alerts: { body: { alerts: [] }, readVersion: 0 },
        }),
      ).rejects.toBeInstanceOf(PersistenceConflictError);
      expect(
        (await store.load<{ items: unknown[] }>("review"))!.body.items,
      ).toEqual([]);
      expect(await store.load("review")).toMatchObject({ version: 1 });
    });
  },
);
