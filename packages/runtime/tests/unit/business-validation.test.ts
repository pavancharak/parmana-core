import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AuthorityStatus,
  AuthorityType,
  BusinessTransactionStatus,
  BusinessValidationStatus,
  ExecutionAssessmentStatus,
  type BusinessTransaction,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
  type RefusalRecord,
  type RefusalRecordRepository,
} from "@parmana/shared";
import {
  PolicyAction,
  type Policy,
  type PolicyRepository,
} from "@parmana/policy";

import { RefusalCrypto } from "@parmana/crypto";

import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";
import { RuntimeError } from "../../src/errors/RuntimeError.js";
import {
  StaticBusinessSignalSourceRegistry,
  type BusinessSignalSource,
  type BusinessSignalSourceAnswer,
} from "../../src/business-validation/BusinessSignalSource.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

//
// RFC-0023: an agent's proposal is never a business fact. These tests
// run the real RuntimeEngine with a policy whose refundEligible fact
// comes from a business source, and check the separate authority,
// business validation and execution answers on every decision.
//

let keyDir: string;
let previousKeyDir: string | undefined;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), "parmana-business-validation-keys-"));
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(
    join(keyDir, "default.private.pem"),
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  writeFileSync(
    join(keyDir, "default.public.pem"),
    publicKey.export({ format: "pem", type: "spki" }),
  );
  previousKeyDir = process.env.PARMANA_KEY_DIR;
  process.env.PARMANA_KEY_DIR = keyDir;
});

afterEach(() => {
  if (previousKeyDir === undefined) delete process.env.PARMANA_KEY_DIR;
  else process.env.PARMANA_KEY_DIR = previousKeyDir;
  rmSync(keyDir, { recursive: true, force: true });
});

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

const REFUND_POLICY: Policy = {
  policyId: "refund-with-sources",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  signalsSchema: { refundEligible: "boolean", managerApproved: "boolean" },
  approvalSignals: { managerApproved: { resourceId: "parameters.orderId" } },
  signalSources: {
    refundEligible: {
      source: "orders-system",
      claim: "refund.eligible",
      subject: "parameters.orderId",
    },
  },
  rules: [
    {
      id: "reject-ineligible",
      condition: { fact: "refundEligible", operator: "eq", value: false },
      outcome: {
        action: PolicyAction.REJECT,
        reason: "The order is not eligible for a refund.",
      },
    },
    {
      id: "approve-refund",
      condition: {
        all: [
          { fact: "managerApproved", operator: "is_true" },
          { fact: "refundEligible", operator: "is_true" },
        ],
      },
      outcome: {
        action: PolicyAction.APPROVE,
        reason: "Eligible and approved.",
      },
    },
  ],
};

function repository(policy: Policy): PolicyRepository {
  return {
    async load() {
      return policy;
    },
    async save() {
      throw new Error("not used");
    },
  };
}

class OrdersSystem implements BusinessSignalSource {
  readonly name = "orders-system";
  public calls = 0;
  constructor(
    private readonly answer: () => Promise<BusinessSignalSourceAnswer>,
  ) {}
  async resolve(): Promise<BusinessSignalSourceAnswer> {
    this.calls++;
    return this.answer();
  }
}

function eligible(value: boolean): OrdersSystem {
  return new OrdersSystem(async () => ({
    kind: "observed",
    value,
    sourceIdentity: "orders.example.internal",
    observedAt: new Date(),
  }));
}

function refund(signals: Record<string, unknown> = {}): BusinessTransaction {
  const at = new Date("2026-10-10T00:00:00Z");
  return {
    businessTransactionId: `txn-${crypto.randomUUID()}`,
    metadata: { businessTransactionId: "txn", submittedBy: "agent-x" },
    authority: {
      authorityId: "a-1",
      authorityType: AuthorityType.SERVICE,
      principalId: "agent-x",
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
      action: "refund",
      target: "orders/123",
      parameters: { orderId: "123", amount: 50000 },
      createdAt: at,
    },
    policy: {
      name: "refund-with-sources",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: signals as never,
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: at,
  };
}

function runtime(
  policy: Policy,
  sources: BusinessSignalSource[] | undefined,
  refusals: RefusalRecords,
  trust: TrustRecords = new TrustRecords(),
) {
  const builder = new RuntimeBuilder()
    .withPolicyRepository(repository(policy))
    .withSignalStateVerifier(testApprovalSignalVerifier());
  if (sources !== undefined) {
    builder.withBusinessSignalSources(
      new StaticBusinessSignalSourceRegistry(sources),
    );
  }
  return builder.build(trust, refusals);
}

describe("business validation (RFC-0023)", () => {
  it("executes when authority and business validity both hold, deciding on the source's value", async () => {
    const orders = eligible(true);
    const trust = new TrustRecords();
    const transaction = await withTestApproval(refund(), REFUND_POLICY);

    // The agent never sent refundEligible: the source supplied it.
    expect(transaction.signals).not.toHaveProperty("refundEligible");

    const result = await runtime(
      REFUND_POLICY,
      [orders],
      new RefusalRecords(),
      trust,
    ).execute(transaction);

    const assessment = result.context.decision.assessment;
    expect(assessment?.authority.status).toBe(AuthorityStatus.AUTHORIZED);
    expect(assessment?.businessValidation.status).toBe(
      BusinessValidationStatus.VALID,
    );
    expect(assessment?.businessValidation.signals?.[0]).toMatchObject({
      signalKey: "refundEligible",
      subject: "123",
      observedValue: true,
      verificationStatus: "VERIFIED",
    });
    expect(assessment?.execution).toBeUndefined();
    expect(orders.calls).toBe(1);

    // Phase 4: the fact is signed into the authorization as a condition,
    // with the value the source gave and until when it holds.
    expect(result.context.authorization?.payload.businessConditions).toEqual([
      {
        signalId: assessment?.businessValidation.signals?.[0]?.signalId,
        signalKey: "refundEligible",
        source: "orders-system",
        claim: "refund.eligible",
        subject: "123",
        value: true,
        validUntil:
          assessment?.businessValidation.signals?.[0]?.validUntil.toISOString(),
      },
    ]);

    // The assessment is inside the signed Trust Record.
    expect(
      trust.created[0]?.executions[0]?.decision.assessment?.businessValidation
        .status,
    ).toBe(BusinessValidationStatus.VALID);
  });

  it("refuses as INVALID when the agent's proposed fact contradicts the source, and executes nothing", async () => {
    const refusals = new RefusalRecords();
    const transaction = await withTestApproval(
      refund({ refundEligible: true }),
      REFUND_POLICY,
    );

    const failure = await runtime(REFUND_POLICY, [eligible(false)], refusals)
      .execute(transaction)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RuntimeError);
    const decision = refusals.created[0]?.decision;
    expect(decision?.matchedRuleId).toBe("business-validation-invalid");
    expect(decision?.assessment).toMatchObject({
      authority: { status: AuthorityStatus.AUTHORIZED },
      businessValidation: { status: BusinessValidationStatus.INVALID },
      execution: {
        status: ExecutionAssessmentStatus.NOT_EXECUTED,
        reason: "Not executed: business validation failed.",
      },
    });
    // The proposal is kept as proposed; the source's value is beside it.
    expect(decision?.signals.refundEligible).toBe(true);
    expect(
      decision?.assessment?.businessValidation.signals?.[0]?.observedValue,
    ).toBe(false);
  });

  it("signs the assessment into the Refusal Record, which verifies after a JSON round trip and fails if a status is changed", async () => {
    const refusals = new RefusalRecords();
    const transaction = await withTestApproval(
      refund({ refundEligible: true }),
      REFUND_POLICY,
    );

    await expect(
      runtime(REFUND_POLICY, [eligible(false)], refusals).execute(transaction),
    ).rejects.toBeInstanceOf(RuntimeError);

    const asReceived = JSON.parse(JSON.stringify(refusals.created[0]));
    const crypto = new RefusalCrypto();
    expect(await crypto.verify(asReceived)).toBe(true);

    asReceived.decision.assessment.businessValidation.status = "VALID";
    expect(await crypto.verify(asReceived)).toBe(false);
  });

  it("lets the policy refuse on the source's value when the agent sent none", async () => {
    const refusals = new RefusalRecords();
    const transaction = await withTestApproval(refund(), REFUND_POLICY);

    await expect(
      runtime(REFUND_POLICY, [eligible(false)], refusals).execute(transaction),
    ).rejects.toBeInstanceOf(RuntimeError);

    const decision = refusals.created[0]?.decision;
    expect(decision?.matchedRuleId).toBe("reject-ineligible");
    expect(decision?.assessment?.businessValidation.status).toBe(
      BusinessValidationStatus.VALID,
    );
    expect(decision?.assessment?.execution?.status).toBe(
      ExecutionAssessmentStatus.NOT_EXECUTED,
    );
  });

  it.each([
    ["no source is registered", undefined],
    [
      "the source fails",
      [
        new OrdersSystem(async () => {
          throw new Error("timeout");
        }),
      ],
    ],
  ])("refuses as SOURCE_UNAVAILABLE when %s", async (_, sources) => {
    const refusals = new RefusalRecords();
    const transaction = await withTestApproval(refund(), REFUND_POLICY);

    await expect(
      runtime(REFUND_POLICY, sources, refusals).execute(transaction),
    ).rejects.toBeInstanceOf(RuntimeError);

    expect(
      refusals.created[0]?.decision.assessment?.businessValidation.status,
    ).toBe(BusinessValidationStatus.SOURCE_UNAVAILABLE);
  });

  it("refuses as MISSING_DATA when the source has no such refund", async () => {
    const refusals = new RefusalRecords();
    const transaction = await withTestApproval(refund(), REFUND_POLICY);
    const orders = new OrdersSystem(async () => ({
      kind: "not_found",
      reason: "No eligible refund exists for order 123.",
    }));

    await expect(
      runtime(REFUND_POLICY, [orders], refusals).execute(transaction),
    ).rejects.toBeInstanceOf(RuntimeError);

    expect(
      refusals.created[0]?.decision.assessment?.businessValidation,
    ).toMatchObject({
      status: BusinessValidationStatus.MISSING_DATA,
    });
  });

  it("does not ask the business system when authority is not established", async () => {
    const refusals = new RefusalRecords();
    const orders = eligible(true);
    // paytm:refund is bound to the customer-refund policy, so deciding it
    // under this one is not authorized.
    const proposal = refund();
    const transaction = await withTestApproval(
      { ...proposal, intent: { ...proposal.intent, action: "paytm:refund" } },
      REFUND_POLICY,
    );

    await expect(
      runtime(REFUND_POLICY, [orders], refusals).execute(transaction),
    ).rejects.toBeInstanceOf(RuntimeError);

    expect(orders.calls).toBe(0);
    expect(refusals.created[0]?.decision.assessment).toMatchObject({
      authority: { status: AuthorityStatus.NOT_AUTHORIZED },
      businessValidation: { status: BusinessValidationStatus.NOT_EVALUATED },
      execution: { status: ExecutionAssessmentStatus.NOT_EXECUTED },
    });
  });

  it("records NOT_EVALUATED, never VALID, under a policy that declares no sources", async () => {
    const { signalSources: _, ...withoutSources } = REFUND_POLICY;
    const policy: Policy = {
      ...withoutSources,
      unboundSignalReasons: {
        refundEligible: "Declared by the caller in this test.",
      },
    };
    const transaction = await withTestApproval(
      refund({ refundEligible: true }),
      policy,
    );

    const result = await runtime(policy, [], new RefusalRecords()).execute(
      transaction,
    );

    expect(result.context.decision.assessment?.businessValidation.status).toBe(
      BusinessValidationStatus.NOT_EVALUATED,
    );
  });
});
