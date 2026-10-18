import crypto, { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  PolicyAction,
  type Policy,
  type PolicyRepository,
} from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import {
  AuthorityStatus,
  AuthorityType,
  BusinessTransactionStatus,
  type BusinessTransaction,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
  type RefusalRecord,
  type RefusalRecordRepository,
} from "@parmana/shared";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";
import { authorityGrantRepository } from "../../src/repositories.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * RFC-0023 phase 3, end to end: a grant made and revoked through
 * /authority-grants (maker checker, step up) is exactly what the runtime
 * reads when it decides a request under a policy with
 * requireAuthorityGrant. The runtime reads the server's own grant
 * repository (repositories.ts), the one createApplication wires.
 */

const MAKER_KEY = "e2e-grant-maker-raw-key-for-tests-only";
const CHECKER_KEY = "e2e-grant-checker-raw-key-for-tests-only";
const checkerStepUp = generateKeyPairSync("ed25519");
const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();

const POLICY: Policy = {
  policyId: "release-goods",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  requireAuthorityGrant: true,
  signalsSchema: { warehouseApproved: "boolean" },
  approvalSignals: {
    warehouseApproved: { resourceId: "parameters.invoiceId" },
  },
  rules: [
    {
      id: "approve-release",
      condition: { fact: "warehouseApproved", operator: "is_true" },
      outcome: { action: PolicyAction.APPROVE, reason: "Approved." },
    },
  ],
};

class TrustRecords implements ExecutionTrustRecordRepository {
  public created: ExecutionTrustRecord[] = [];
  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    this.created.push(record);
    return record;
  }
  async findByTransactionId(): Promise<null> {
    return null;
  }
  async appendExecution(): Promise<void> {}
  async replaceExecution(): Promise<void> {}
  async appendOverride(): Promise<void> {}
  async appendVerification(): Promise<void> {}
  async appendReceipt(): Promise<void> {}
}

class RefusalRecords implements RefusalRecordRepository {
  public created: RefusalRecord[] = [];
  async create(record: RefusalRecord): Promise<RefusalRecord> {
    this.created.push(record);
    return record;
  }
  async findByTransactionId(): Promise<null> {
    return null;
  }
}

function governanceApp() {
  const { executionSystem } = createInspectableExecutionSystem();

  return createApp(createApplication(executionSystem), {
    callerAuth: {
      authenticator: new StaticKeyAuthenticator([
        {
          callerId: "e2e-maker",
          keyHash: hashApiKey(MAKER_KEY),
          credentialHolderType: AuthorityType.USER,
        },
        {
          callerId: "e2e-checker",
          keyHash: hashApiKey(CHECKER_KEY),
          credentialHolderType: AuthorityType.USER,
          stepUpPublicKey: checkerStepUp.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
      ]),
      auditSink: new InMemoryCallerAuditSink(),
    },
    stepUpVerifier: new PolicyChangeStepUpVerifier({
      nonceStore: new MemoryNonceStore(),
    }),
  });
}

async function change(
  app: ReturnType<typeof governanceApp>,
  body: Record<string, unknown>,
): Promise<void> {
  const proposed = await request(app)
    .post("/authority-grants/changes")
    .set("Authorization", `Bearer ${MAKER_KEY}`)
    .send({ reason: "E2E.", ...body });
  expect(proposed.status).toBe(201);

  const approved = await request(app)
    .post(`/authority-grants/changes/${proposed.body.changeId}/approve`)
    .set("Authorization", `Bearer ${CHECKER_KEY}`)
    .send({
      stepUpAuthorization: await stepUpSigner.sign(
        { pendingPolicyChangeId: proposed.body.changeId, action: "approve" },
        checkerStepUp.privateKey,
        "checker-step-up-key",
        120,
      ),
    });
  expect(approved.status).toBe(200);
}

function release(callerId: string, amount: number): BusinessTransaction {
  const at = new Date();
  return {
    businessTransactionId: `txn-${crypto.randomUUID()}`,
    metadata: { businessTransactionId: "txn", submittedBy: callerId },
    authority: {
      authorityId: "a-1",
      authorityType: AuthorityType.SERVICE,
      principalId: callerId,
      issuedAt: at,
    },
    authorization: {
      authorizationId: "z-1",
      authorityId: "a-1",
      purpose: "test",
      issuedAt: at,
    },
    intent: {
      intentId: "i-1",
      authorizationId: "z-1",
      action: "erp:release-goods",
      target: "invoices/INV-1",
      parameters: { invoiceId: "INV-1", amount },
      createdAt: at,
    },
    policy: { name: "release-goods", version: "1.0.0", schemaVersion: "1.0.0" },
    signals: {} as never,
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: at,
  };
}

function runtime(trust: TrustRecords, refusals: RefusalRecords) {
  const policies: PolicyRepository = {
    async load() {
      return POLICY;
    },
    async save() {
      throw new Error("not used");
    },
  };

  return new RuntimeBuilder()
    .withPolicyRepository(policies)
    .withSignalStateVerifier(testApprovalSignalVerifier())
    .withAuthorityGrants(authorityGrantRepository)
    .build(trust, refusals);
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("A grant made through /authority-grants decides through the runtime (RFC-0023 phase 3)", () => {
  it("refuses before the grant, executes within it, refuses outside its limit, and refuses after the revoke", async () => {
    const app = governanceApp();
    const agent = `e2e-agent-${crypto.randomUUID()}`;
    const trust = new TrustRecords();
    const refusals = new RefusalRecords();
    const engine = runtime(trust, refusals);
    const decide = async (amount: number) =>
      engine.execute(await withTestApproval(release(agent, amount), POLICY));

    await expect(decide(500)).rejects.toThrow();
    expect(refusals.created.at(-1)?.decision.matchedRuleId).toBe(
      "authority-not-authorized",
    );

    await change(app, {
      action: "grant",
      callerId: agent,
      capability: "erp:release-goods",
      limits: { "parameters.amount": { max: 1000 } },
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const result = await decide(500);
    expect(result.context.decision.assessment?.authority).toMatchObject({
      status: AuthorityStatus.AUTHORIZED,
      grant: {
        callerId: agent,
        limits: { "parameters.amount": { max: 1000 } },
      },
    });

    await expect(decide(1001)).rejects.toThrow();
    expect(refusals.created.at(-1)?.decision.assessment?.authority.status).toBe(
      AuthorityStatus.NOT_AUTHORIZED,
    );

    await change(app, {
      action: "revoke",
      callerId: agent,
      capability: "erp:release-goods",
    });

    await expect(decide(500)).rejects.toThrow();
    expect(refusals.created.at(-1)?.decision.matchedRuleId).toBe(
      "authority-not-authorized",
    );
    expect(trust.created).toHaveLength(1);
  });
});
