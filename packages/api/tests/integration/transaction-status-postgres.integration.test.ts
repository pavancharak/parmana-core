import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { AuthorityType } from "@parmana/shared";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { seedPolicyGovernanceApprovals } from "../../../../test-support/policy-governance.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * The route flow of decision D23 on a real Postgres database, through the
 * API, with the Postgres repositories behind the routes.
 *
 * The API's repository module is replaced for this file only, by a module
 * mock that returns the Postgres provider's repositories. The mock is lazy, so
 * the file loads without a database; its suite is skipped unless
 * TEST_DATABASE_URL is set and ALLOW_LIVE_SUPABASE=1. The database must be a
 * local or test database: the test setup refuses production projects by name.
 *
 * The status store is wrapped so that one EXECUTED write can be made to fail,
 * which is the failure the reconciliation test needs. Nothing else is faked.
 */
vi.mock("../../src/repositories.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const { PostgresStorageProvider } = await import("@parmana/storage");

  let provider: InstanceType<typeof PostgresStorageProvider> | undefined;
  const getProvider = () => (provider ??= new PostgresStorageProvider());

  const lazy = (
    pick: (p: InstanceType<typeof PostgresStorageProvider>) => unknown,
  ) =>
    new Proxy({} as object, {
      get: (_target, property) => {
        const target = pick(getProvider()) as Record<string, unknown>;
        const value = target[property as string];
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });

  const statusEvents = lazy((p) => {
    const real = p.transactionStatusEvents;
    return {
      current: (id: string) => real.current(id),
      history: (id: string) => real.history(id),
      append: async (input: { to: string } & Record<string, unknown>) => {
        const g = globalThis as { __failExecutedWriteOnce?: boolean };
        if (g.__failExecutedWriteOnce && input.to === "EXECUTED") {
          g.__failExecutedWriteOnce = false;
          throw new Error("simulated failure of the EXECUTED write");
        }
        return real.append(input as never);
      },
    };
  });

  return {
    ...actual,
    businessTransactionRepository: lazy((p) => p.businessTransactions),
    executionTrustRecordRepository: lazy((p) => p.trustRecords),
    refusalRecordRepository: lazy((p) => p.refusalRecords),
    inboundDecisionRepository: lazy((p) => p.inboundDecisions),
    inboundCheckRepository: lazy((p) => p.inboundChecks),
    inboundOutcomeRepository: lazy((p) => p.inboundOutcomes),
    executionIntentRepository: lazy((p) => p.executionIntents),
    transactionStatusEventRepository: statusEvents,
    transactionDeclarationStore: lazy((p) => p.transactionDeclarations),
    transactionExecutionLockStore: lazy((p) => p.transactionExecutionLocks),
    pendingPolicyChangeRepository: lazy((p) => p.pendingPolicyChanges),
    policyChangeApprovalRecordRepository: lazy(
      (p) => p.policyChangeApprovalRecords,
    ),
    handbookDownloadLeadRepository: lazy((p) => p.handbookDownloadLeads),
    approvalIssuerRepository: lazy((p) => p.approvalIssuers),
    callerKeyRevocationRepository: lazy((p) => p.callerKeyRevocations),
    externalConnectorRepository: lazy((p) => p.externalConnectors),
    businessSignalSourceRepository: lazy((p) => p.businessSignalSources),
    authorityGrantRepository: lazy((p) => p.authorityGrants),
  };
});

const databaseConfigured = resolveDatabaseGate(
  "Transaction status over HTTP on Postgres",
);

describe.skipIf(!databaseConfigured)(
  "Transaction status (D23) over HTTP, on Postgres",
  () => {
    const CALLER_KEY = "pg-caller-raw-key-for-tests-only";
    const OPERATOR_KEY = "pg-operator-raw-key-for-tests-only";

    let pool: Pool;
    let previousIntentsCheck: string | undefined;
    let app: ReturnType<typeof createApp>;

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      // Reconciliation reads the execution intent. Intents are off in the test
      // environment unless this is set, and production always enforces them.
      previousIntentsCheck = process.env.EXECUTION_INTENTS_CHECK;
      process.env.EXECUTION_INTENTS_CHECK = "true";
      // The governance rows and the status events are append-only, so this suite
      // cannot clean up after itself. It needs a database made from the migrations
      // and nothing else.
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM business_transactions",
      );
      if (rows[0].n > 0) {
        throw new Error(
          `this suite needs an empty test database, and found ${rows[0].n} business transactions. Recreate the database from the migrations, then run it again.`,
        );
      }
      const { executionSystem } = createInspectableExecutionSystem();
      const application = createApplication(executionSystem);
      const authenticator = new StaticKeyAuthenticator([
        {
          callerId: "pg-caller",
          keyHash: hashApiKey(CALLER_KEY),
          allowedPrincipalIds: ["integration-test"],
          allowedCapabilities: ["test:fixture-execute"],
        },
        {
          callerId: "pg-operator",
          keyHash: hashApiKey(OPERATOR_KEY),
          allowedPrincipalIds: ["integration-test"],
          allowedCapabilities: ["test:fixture-execute"],
          credentialHolderType: AuthorityType.USER,
        },
      ]);
      app = createApp(application, {
        callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
      });
      await seedPolicyGovernanceApprovals();
    }, 60000);

    afterAll(async () => {
      (
        globalThis as { __failExecutedWriteOnce?: boolean }
      ).__failExecutedWriteOnce = false;
      if (previousIntentsCheck === undefined)
        delete process.env.EXECUTION_INTENTS_CHECK;
      else process.env.EXECUTION_INTENTS_CHECK = previousIntentsCheck;
      await pool.end();
    });

    async function declare(key = CALLER_KEY): Promise<string> {
      const response = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${key}`)
        .send(await createBusinessTransaction());
      expect(response.status).toBe(201);
      return response.body.businessTransactionId as string;
    }

    async function events(id: string) {
      const { rows } = await pool.query(
        `SELECT sequence, status, stage, legacy, record_ref, reason
         FROM transaction_status_events WHERE business_transaction_id = $1 ORDER BY sequence`,
        [id],
      );
      return rows as Array<{
        sequence: string;
        status: string;
        stage: string;
        legacy: boolean;
        record_ref: string | null;
        reason: string | null;
      }>;
    }

    it("declares, executes and reads the history, all written to Postgres", async () => {
      const id = await declare();

      const stored = await pool.query(
        "SELECT 1 FROM business_transactions WHERE business_transaction_id = $1",
        [id],
      );
      expect(stored.rowCount).toBe(1);
      expect((await events(id)).map((e) => e.status)).toEqual(["RECEIVED"]);

      const executed = await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_KEY}`)
        .send();
      expect(executed.status).toBe(200);

      const status = await request(app)
        .get(`/transactions/${id}/status?history=true`)
        .set("Authorization", `Bearer ${CALLER_KEY}`);
      expect(status.body.current.status).toBe("VERIFIED");
      expect(
        status.body.history.map((e: { status: string }) => e.status),
      ).toEqual([
        "RECEIVED",
        "POLICY_EVALUATED",
        "APPROVED",
        "EXECUTING",
        "EXECUTED",
        "VERIFIED",
      ]);

      const rows = await events(id);
      expect(rows.map((r) => Number(r.sequence))).toEqual([1, 2, 3, 4, 5, 6]);
      expect(rows.every((r) => r.legacy === false)).toBe(true);
      expect(
        rows.find((r) => r.status === "EXECUTED")?.record_ref,
      ).toBeTruthy();
    }, 60000);

    it("two executes at once on Postgres: one is released, the other is refused with 409, and the history has six events", async () => {
      const id = await declare();

      const [a, b] = await Promise.all([
        request(app)
          .post(`/transactions/${id}/execute`)
          .set("Authorization", `Bearer ${CALLER_KEY}`)
          .send(),
        request(app)
          .post(`/transactions/${id}/execute`)
          .set("Authorization", `Bearer ${CALLER_KEY}`)
          .send(),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const refused = a.status === 409 ? a : b;
      expect(refused.body.code).toBe("INVALID_STATUS_TRANSITION");
      expect(await events(id)).toHaveLength(6);
    }, 60000);

    it("refuses a legacy transaction on Postgres, and writes no event", async () => {
      // A transaction declared before status events existed: its row, and the one
      // RECEIVED event the migration would have written, marked legacy.
      const legacy = await createBusinessTransaction();
      const id = legacy.businessTransactionId;
      // The route answers 404 unless the caller is the one that declared it.
      legacy.metadata = { ...legacy.metadata, submittedBy: "pg-caller" };
      await pool.query(
        `INSERT INTO business_transactions
         (business_transaction_id, status, authority_json, authorization_json, intent_json,
          metadata_json, policy_json, signals_json, created_at)
       VALUES ($1, 'RECEIVED', $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, now())`,
        [
          id,
          JSON.stringify(legacy.authority),
          JSON.stringify(legacy.authorization),
          JSON.stringify(legacy.intent),
          JSON.stringify(legacy.metadata),
          JSON.stringify(legacy.policy),
          JSON.stringify(legacy.signals),
        ],
      );
      await pool.query(
        `INSERT INTO transaction_status_events
         (event_id, business_transaction_id, sequence, status, stage, occurred_at, legacy)
       VALUES (gen_random_uuid(), $1, 1, 'RECEIVED', 'declare', now(), true)`,
        [id],
      );

      const response = await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_KEY}`)
        .send();

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/legacy transaction/);
      expect(await events(id)).toHaveLength(1);
    }, 60000);

    it("reconciles a release whose EXECUTED write failed, through the operator route, on Postgres", async () => {
      const id = await declare();
      const g = globalThis as { __failExecutedWriteOnce?: boolean };

      // The release reaches the connector; only the EXECUTED status write fails.
      g.__failExecutedWriteOnce = true;
      const executed = await request(app)
        .post(`/transactions/${id}/execute`)
        .set("Authorization", `Bearer ${CALLER_KEY}`)
        .send();
      g.__failExecutedWriteOnce = false;

      // Finding 18: the release happened, so the caller gets the signed record
      // with outcome pending (202), while the status is still EXECUTING.
      expect(executed.status).toBe(202);
      expect(executed.body.outcome).toBe("pending");
      expect(executed.body.status).toBe("EXECUTING");
      expect(executed.body.record.businessTransactionId).toBe(id);
      expect(executed.body.record.signature).toBeDefined();
      const before = await events(id);
      expect(before.map((e) => e.status)).toEqual([
        "RECEIVED",
        "POLICY_EVALUATED",
        "APPROVED",
        "EXECUTING",
      ]);

      const status = await request(app)
        .get(`/transactions/${id}/status`)
        .set("Authorization", `Bearer ${CALLER_KEY}`);
      expect(status.body.current.status).toBe("EXECUTING");

      // Reconciliation is for human operators only.
      const refused = await request(app)
        .post(`/transactions/${id}/reconcile`)
        .set("Authorization", `Bearer ${CALLER_KEY}`)
        .send();
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("NON_HUMAN_CALLER_DENIED");

      // The operator's reconciliation reads the intent, which is released, and writes EXECUTED.
      const reconciled = await request(app)
        .post(`/transactions/${id}/reconcile`)
        .set("Authorization", `Bearer ${OPERATOR_KEY}`)
        .send();
      expect(reconciled.status).toBe(200);
      expect(reconciled.body).toMatchObject({
        changed: true,
        status: "EXECUTED",
      });

      const after = await events(id);
      const last = after.at(-1)!;
      expect(last).toMatchObject({ status: "EXECUTED", stage: "reconcile" });
      expect(last.record_ref).toBeTruthy();
      expect(last.reason).toMatch(
        /^reconciled by operator pg-operator: the release is recorded$/,
      );

      // A second reconciliation changes nothing.
      const again = await request(app)
        .post(`/transactions/${id}/reconcile`)
        .set("Authorization", `Bearer ${OPERATOR_KEY}`)
        .send();
      expect(again.body).toMatchObject({ changed: false, status: "EXECUTED" });
      expect(await events(id)).toHaveLength(after.length);
    }, 60000);
  },
);
