import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessTransaction, SignedApproval } from "@parmana/shared";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";
import {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
} from "@parmana/connector-paytm";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

/**
 * The refund evaluation for the AgenTrust proposal
 * (docs/evaluation/agentrust-refund/README.md).
 *
 * Three cases through the real POST /execute path and the production
 * bootstrap, with customer-refund 1.2.0 and a hermetic mock Paytm
 * connector service:
 *
 *   valid-approval  a signed manager approval for the order and amount
 *   refusal         every caller fact true, no approval attached
 *   replay          the approval from valid-approval, used again
 *
 * For each case it records the HTTP status, the decision, and how many
 * times the connector was invoked by that case. Every connector result is
 * labelled as a mock result: nothing here confirms a downstream refund.
 *
 * Set AGENTRUST_REPORT to a file path to write the report as JSON, and
 * AGENTRUST_FIXTURES to a directory to write the full signed records, the
 * signed approval and both public keys there, so the records can be checked
 * offline by someone who does not run Parmana.
 */

const approver = vi.hoisted(() => ({
  approverId: "manager-eval",
  keyId: "manager-eval-key-1",
}));

const approverKeys = generateKeyPairSync("ed25519");

vi.mock("../../src/bootstrap/createApprovalIssuerRegistry.js", () => ({
  createApprovalIssuerRegistry: () =>
    new StaticApprovalIssuerRegistry([
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        publicKey: approverKeys.publicKey,
        revoked: false,
      },
    ]),
}));

interface CaseResult {
  readonly case: "valid-approval" | "refusal" | "replay";
  readonly approvalAttached: boolean;
  readonly httpStatus: number;
  readonly code: string | null;
  readonly decision: string | null;
  readonly connectorInvocations: number;
  readonly connectorResult: string;
  readonly reason: string | null;
  readonly record: RecordSummary | null;
}

/** A full signed record as the API returned it, for the fixtures. */
interface FetchedRecord {
  readonly summary: RecordSummary;
  readonly body: unknown;
}

interface RecordSummary {
  readonly type: "ExecutionTrustRecord" | "RefusalRecord";
  readonly id: string;
  readonly hash: string;
  readonly signatureAlgorithm: string | null;
  readonly policyContentHash: string | null;
  readonly matchedRuleId: string | null;
  readonly serverVerified: boolean | null;
}

/** Reads a nested field of a JSON value, or undefined. */
function at(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const MOCK_RESULT =
  "mock connector result (MockPaytmConnectorServer); not a confirmed downstream refund";
const NO_CALL = "connector not invoked";

describe("AgenTrust refund evaluation", () => {
  let server: MockPaytmConnectorServer | undefined;
  const originalUrl = process.env.PAYTM_CONNECTOR_URL;
  const originalSecret = process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    if (originalUrl === undefined) delete process.env.PAYTM_CONNECTOR_URL;
    else process.env.PAYTM_CONNECTOR_URL = originalUrl;
    if (originalSecret === undefined) {
      delete process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET;
    } else {
      process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET = originalSecret;
    }
  });

  function refund(
    orderId: string,
    amount: number,
    approval?: SignedApproval,
  ): BusinessTransaction {
    const businessTransactionId = crypto.randomUUID();
    const authorityId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();

    return {
      businessTransactionId,
      metadata: {
        businessTransactionId,
        correlationId: crypto.randomUUID(),
        createdBy: "agentrust-evaluation",
        createdAt: new Date(),
      },
      authority: {
        authorityId,
        authorityType: "USER",
        principalId: "agentrust-evaluation",
        displayName: "AgenTrust evaluation",
        issuedAt: new Date(),
      },
      authorization: {
        authorizationId,
        authorityId,
        purpose: "AgenTrust evaluation",
        authorizedAt: new Date(),
      },
      intent: {
        intentId: crypto.randomUUID(),
        authorizationId,
        action: "paytm:refund",
        target: `paytm://orders/${orderId}`,
        parameters: Object.freeze({
          orderId,
          transactionId: `txn-${orderId}`,
          amount,
        }),
        createdAt: new Date(),
      },
      policy: {
        name: "customer-refund",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      },
      // refundEligible and fraudCheckPassed are declared by the caller and
      // not checked against any system; they can only refuse.
      signals: {
        refundEligible: true,
        managerApproved: true,
        fraudCheckPassed: true,
        refundAmount: amount,
        ...(approval !== undefined
          ? { approvalArtifact: JSON.parse(JSON.stringify(approval)) }
          : {}),
      },
      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;
  }

  it("records the decision and connector invocations for a valid approval, a refusal and a replay", async () => {
    const mock = new MockPaytmConnectorServer({
      sharedSecret: PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
    });
    await mock.listen();
    server = mock;
    process.env.PAYTM_CONNECTOR_URL = mock.baseUrl;
    process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET =
      PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;

    const app = createApp(createApplication(await createExecutionSystem()), {
      callerAuth: "disabled",
    });

    const approval = await new ApprovalArtifactSigner().sign(
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        capability: "paytm:refund",
        resourceId: "order-eval-1",
        scope: { field: "value", comparator: "lte", value: 500 },
        ttlSeconds: 900,
      },
      approverKeys.privateKey,
    );

    async function fetchRecord(
      businessTransactionId: string,
      approved: boolean,
    ): Promise<FetchedRecord | null> {
      if (approved) {
        const got = await request(app).get(
          `/trust-records/${businessTransactionId}`,
        );
        if (got.status !== 200) return null;
        const record: unknown = got.body;
        const summary: RecordSummary = {
          type: "ExecutionTrustRecord",
          id: String(at(record, "trustRecordId")),
          hash: String(at(record, "trustRecordHash")),
          signatureAlgorithm: str(at(record, "signature", "algorithm")),
          policyContentHash: str(
            at(record, "transaction", "policy", "contentHash"),
          ),
          matchedRuleId: null,
          serverVerified: null,
        };
        return { summary, body: record };
      }
      const got = await request(app).get(`/refusal/${businessTransactionId}`);
      if (got.status !== 200) return null;
      const record: unknown = got.body;
      const verified = await request(app).post("/refusal/verify").send(record);
      const summary: RecordSummary = {
        type: "RefusalRecord",
        id: String(at(record, "refusalRecordId")),
        hash: String(at(record, "refusalRecordHash")),
        signatureAlgorithm: str(at(record, "signature", "algorithm")),
        policyContentHash: str(at(record, "policyContentHash")),
        matchedRuleId: str(at(record, "decision", "matchedRuleId")),
        serverVerified:
          verified.status === 200 ? at(verified.body, "valid") === true : false,
      };
      return { summary, body: record };
    }

    const results: CaseResult[] = [];
    const fullRecords: { case: CaseResult["case"]; body: unknown }[] = [];

    async function run(
      name: CaseResult["case"],
      transaction: BusinessTransaction,
      approvalAttached: boolean,
    ): Promise<CaseResult> {
      const before = mock.paytmInvocationCount;
      const response = await request(app).post("/execute").send(transaction);
      const invocations = mock.paytmInvocationCount - before;
      const body = response.body as Record<string, unknown>;
      const businessTransactionId = (
        transaction as { businessTransactionId: string }
      ).businessTransactionId;
      const fetched = await fetchRecord(
        businessTransactionId,
        response.status === 200,
      );
      if (fetched) fullRecords.push({ case: name, body: fetched.body });
      const result: CaseResult = {
        case: name,
        approvalAttached,
        httpStatus: response.status,
        code: typeof body.code === "string" ? body.code : null,
        decision: response.status === 200 ? "APPROVED" : "REFUSED",
        connectorInvocations: invocations,
        connectorResult: invocations > 0 ? MOCK_RESULT : NO_CALL,
        reason: typeof body.error === "string" ? body.error : null,
        record: fetched?.summary ?? null,
      };
      results.push(result);
      return result;
    }

    const valid = await run(
      "valid-approval",
      refund("order-eval-1", 500, approval),
      true,
    );
    const refusal = await run("refusal", refund("order-eval-2", 500), false);
    const replay = await run(
      "replay",
      refund("order-eval-1", 500, approval),
      true,
    );

    expect(valid.httpStatus).toBe(200);
    expect(valid.connectorInvocations).toBe(1);
    expect(valid.record?.type).toBe("ExecutionTrustRecord");
    expect(valid.record?.policyContentHash).toMatch(/^[0-9a-f]{64}$/);

    expect(refusal.httpStatus).toBe(403);
    expect(refusal.code).toBe("POLICY_DENIED");
    expect(refusal.connectorInvocations).toBe(0);
    expect(refusal.record?.type).toBe("RefusalRecord");
    expect(refusal.record?.serverVerified).toBe(true);
    expect(refusal.record?.policyContentHash).toBe(
      valid.record?.policyContentHash,
    );

    expect(replay.httpStatus).not.toBe(200);
    expect(replay.connectorInvocations).toBe(0);
    expect(replay.reason).toContain("verified managerApproved=false");
    expect(replay.record?.policyContentHash).toBe(
      valid.record?.policyContentHash,
    );

    expect(mock.paytmInvocationCount).toBe(1);

    const reportPath = process.env.AGENTRUST_REPORT;
    if (reportPath) {
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            scenario: "paytm:refund under customer-refund 1.2.0",
            connector: "MockPaytmConnectorServer (hermetic, in process)",
            limitation:
              "refundEligible and fraudCheckPassed are declared by the caller and not checked against any system; they can only refuse. The signed manager approval is what authorizes.",
            totalConnectorInvocations: mock.paytmInvocationCount,
            cases: results,
          },
          null,
          2,
        ) + "\n",
      );
    }

    const fixturesDir = process.env.AGENTRUST_FIXTURES;
    if (fixturesDir) {
      mkdirSync(fixturesDir, { recursive: true });
      const write = (name: string, value: unknown) =>
        writeFileSync(
          path.join(fixturesDir, name),
          JSON.stringify(value, null, 2) + "\n",
        );
      const files = {
        "valid-approval": "01-valid-approval.execution-trust-record.json",
        refusal: "02-refusal.refusal-record.json",
        replay: "03-replay.refusal-record.json",
      } as const;
      for (const { case: name, body } of fullRecords) write(files[name], body);
      write("approval.json", approval);
      const signingKey = await request(app).get("/keys/default");
      expect(signingKey.status).toBe(200);
      write("parmana-signing-key.json", signingKey.body);
      write("approver-key.json", {
        ...approver,
        algorithm: "ed25519",
        publicKeyPem: approverKeys.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      });
    }
  });
});
