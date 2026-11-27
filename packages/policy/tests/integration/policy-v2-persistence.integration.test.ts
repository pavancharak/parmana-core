import { generateKeyPairSync } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveDatabaseGate } from "../../../../test-support/database-gate.js";
import {
  acquirePolicyV2SuiteLock,
  releasePolicyV2SuiteLock,
} from "../helpers/policy-v2-database-lock.js";
import { AlertBoard } from "../../src/v2/alerts.js";
import { EvidenceLog, type EvidenceRecord } from "../../src/v2/evidence.js";
import {
  PersistenceConflictError,
  PolicyV2Store,
} from "../../src/v2/persistence.js";
import { PolicyRegister, type Person } from "../../src/v2/register.js";
import { ReviewQueue } from "../../src/v2/review.js";

/** Persistence for policy version 2 against a real database (plan step 9). */

const databaseConfigured = resolveDatabaseGate("Policy v2 persistence");
const NOW = new Date("2026-11-18T09:00:00.000Z");
const CAPABILITY = "erp:pay-invoice";
const PEM = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "pem" })
  .toString();

const sourceOwner: Person = { id: "src-owner", roles: ["source-owner"] };
const second: Person = { id: "second-1", roles: ["second-approver"] };
const parmana: Person = { id: "parmana-1", roles: ["parmana-owner"] };

function register(): PolicyRegister {
  const r = new PolicyRegister(() => NOW);
  r.proposeSource(
    {
      name: "ledger",
      dataOwner: "finance",
      signer: { kind: "system" },
      keyId: "ledger-key",
      publicKeyPem: PEM,
      claims: { "funds.available": "" },
      canApprove: false,
    },
    sourceOwner,
  );
  r.approveSource("ledger", second);
  r.registerAction(
    {
      capability: CAPABILITY,
      owner: "action-owner-1",
      successor: "action-owner-2",
      reviewers: ["r1", "r2", "r3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    parmana,
  );
  return r;
}

describe.skipIf(!databaseConfigured)(
  "policy v2 persistence (live database)",
  () => {
    let pool: Pool;
    let lock: PoolClient | undefined;
    let store: PolicyV2Store;

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

    it("saves the register and reads it back so that it works the same", async () => {
      const original = register();
      const version = await store.save("register", original.snapshot(), 0);
      expect(version).toBe(1);

      const saved =
        await store.load<ReturnType<PolicyRegister["snapshot"]>>("register");
      const restored = new PolicyRegister(() => NOW);
      restored.load(saved!.body);
      expect(restored.snapshot()).toEqual(
        JSON.parse(JSON.stringify(original.snapshot())),
      );
      expect(restored.keyFor("ledger", "ledger-key")).toBeDefined();
    });

    it("saves the review queue, and the counter carries on after a restart", async () => {
      const queue = new ReviewQueue(() => NOW);
      queue.grant("parmana-1", {
        reviewerId: "rev-1",
        capability: CAPABILITY,
        maxAmount: 50_000,
      });
      const first = queue.open({
        decisionRecord: { recordId: "ev-1", hash: "0".repeat(64) },
        capability: CAPABILITY,
        target: "INV-1",
        requester: "agent-7",
        decisionRef: { policyHash: "a".repeat(64), matchedRuleId: "r" },
        reason: "High risk.",
        view: {
          capability: CAPABILITY,
          target: "INV-1",
          values: {},
          missing: [],
          callerReason: "Due.",
        },
        highValue: false,
        amount: 9000,
        windowBusinessDays: 1,
      });
      await store.save("review", queue.snapshot(), 0);

      const restored = new ReviewQueue(() => NOW);
      restored.load(
        (await store.load<ReturnType<ReviewQueue["snapshot"]>>("review"))!.body,
      );
      expect(restored.get(first.id)?.status).toBe("open");
      expect(restored.canReview(first.id, "rev-1")).toBe(true);
      const second = restored.open({
        decisionRecord: { recordId: "ev-1", hash: "0".repeat(64) },
        capability: CAPABILITY,
        target: "INV-2",
        requester: "agent-7",
        decisionRef: { policyHash: "a".repeat(64), matchedRuleId: "r" },
        reason: "High risk.",
        view: {
          capability: CAPABILITY,
          target: "INV-2",
          values: {},
          missing: [],
          callerReason: "Due.",
        },
        highValue: false,
        amount: 100,
        windowBusinessDays: 1,
      });
      expect(second.id).not.toBe(first.id);
    });

    it("saves the alert board, and its open alerts are still open after a restart", async () => {
      const board = new AlertBoard(
        () => NOW,
        () => true,
      );
      const alert = board.raise({
        ref: "review-1",
        kind: "review.waiting",
        class: "immediate",
        assignee: "rev-1",
        openedAt: NOW.toISOString(),
        deadline: new Date(NOW.getTime() + 4 * 3600_000).toISOString(),
        explanation: "A review is waiting.",
        consequence: "It expires.",
        steps: ["Decide."],
        helpRef: "reviewers-decide",
      });
      await store.save("alerts", board.snapshot(), 0);

      const restored = new AlertBoard(
        () => NOW,
        () => true,
      );
      restored.load(
        (await store.load<ReturnType<AlertBoard["snapshot"]>>("alerts"))!.body,
      );
      expect(restored.get(alert.id)?.status).toBe("open");
      expect(restored.visibleFor({ id: "rev-1", roles: [] })).toHaveLength(1);
    });

    it("refuses a save made from a version that another writer has already replaced", async () => {
      const v1 = await store.save("register", { a: 1 }, 0);
      await store.save("register", { a: 2 }, v1);
      await expect(store.save("register", { a: 3 }, v1)).rejects.toBeInstanceOf(
        PersistenceConflictError,
      );
      await expect(store.save("register", { a: 3 }, 0)).rejects.toBeInstanceOf(
        PersistenceConflictError,
      );
      expect((await store.load<{ a: number }>("register"))?.body).toEqual({
        a: 2,
      });
    });

    it("appends evidence that links to the record before it, and the chain verifies when read back", async () => {
      const log = new EvidenceLog();
      const make = (id: string) =>
        log.append({
          recordId: id,
          decidedAt: NOW.toISOString(),
          request: {
            capability: CAPABILITY,
            transactionId: id,
            target: "INV-1",
            parameters: {},
            signals: {},
          },
          policyHash: "a".repeat(64),
          decision: {
            outcome: "APPROVE",
            reason: "ok",
            policy: { capability: CAPABILITY, hash: "a".repeat(64) },
            values: {},
          },
          inputs: { answers: {}, approvals: {} },
          snapshot: {
            sources: [],
            approvers: [],
            registerView: { sources: {} },
            thresholds: {},
          },
        } as never);
      const first = make("ev-1");
      const second = make("ev-2");
      await store.appendEvidence(first);
      await store.appendEvidence(second);
      const read = await store.readEvidence();
      expect(read.map((r: EvidenceRecord) => r.recordId)).toEqual([
        "ev-1",
        "ev-2",
      ]);
      expect(new EvidenceLog().verifyChain(read)).toBe(true);
    });

    it("refuses an evidence record that does not link to the last stored record", async () => {
      const log = new EvidenceLog();
      const first = log.append({
        recordId: "ev-1",
        decidedAt: NOW.toISOString(),
        request: {},
        policyHash: "a",
        decision: {},
        inputs: {},
        snapshot: {},
      } as never);
      await store.appendEvidence(first);
      const orphan = {
        ...first,
        recordId: "ev-x",
        prevHash: "not-the-last-hash",
        hash: "b".repeat(64),
      };
      await expect(
        store.appendEvidence(orphan as EvidenceRecord),
      ).rejects.toBeInstanceOf(PersistenceConflictError);
      expect((await store.readEvidence()).map((r) => r.recordId)).toEqual([
        "ev-1",
      ]);
    });

    it("refuses to change or delete stored evidence, at the database", async () => {
      const log = new EvidenceLog();
      await store.appendEvidence(
        log.append({
          recordId: "ev-1",
          decidedAt: NOW.toISOString(),
          request: {},
          policyHash: "a",
          decision: {},
          inputs: {},
          snapshot: {},
        } as never),
      );
      await expect(
        pool.query("UPDATE policy_v2_evidence SET policy_hash = 'x'"),
      ).rejects.toThrow(/append only/);
      await expect(
        pool.query("DELETE FROM policy_v2_evidence"),
      ).rejects.toThrow(/append only/);
    });
  },
);
