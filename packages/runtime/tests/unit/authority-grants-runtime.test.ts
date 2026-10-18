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
  type AuthorityGrant,
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
import type { AuthorityGrantSource } from "../../src/authority/AuthorityGrantEvaluator.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

//
// RFC-0023 phase 3: per-agent authority. These tests run the real
// RuntimeEngine, with a signed approval, under a policy that requires an
// authority grant, and check that only the authenticated caller's
// current grant, within its limits, lets a request be decided.
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

function grant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    grantId: "grant-1",
    callerId: "agent-x",
    capability: "release-goods",
    limits: { "parameters.amount": { max: 100000 } },
    validFrom: new Date(Date.now() - 86_400_000),
    validUntil: new Date(Date.now() + 86_400_000),
    status: "active",
    grantedAt: new Date(Date.now() - 86_400_000),
    ...overrides,
  };
}

class Grants implements AuthorityGrantSource {
  public calls = 0;
  constructor(private readonly found: AuthorityGrant | null) {}
  async findActive(callerId: string, capability: string) {
    this.calls++;
    return this.found !== null &&
      this.found.callerId === callerId &&
      this.found.capability === capability
      ? this.found
      : null;
  }
}

function release(
  amount: number,
  submittedBy: string | null = "agent-x",
): BusinessTransaction {
  const at = new Date("2026-10-11T00:00:00Z");
  return {
    businessTransactionId: `txn-${crypto.randomUUID()}`,
    metadata: {
      businessTransactionId: "txn",
      ...(submittedBy !== null && { submittedBy }),
    },
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
      action: "release-goods",
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

function runtime(
  grants: AuthorityGrantSource | undefined,
  refusals: RefusalRecords,
  trust: TrustRecords = new TrustRecords(),
) {
  const builder = new RuntimeBuilder()
    .withPolicyRepository(repository(POLICY))
    .withSignalStateVerifier(testApprovalSignalVerifier());
  if (grants !== undefined) {
    builder.withAuthorityGrants(grants);
  }
  return builder.build(trust, refusals);
}

describe("per-agent authority (RFC-0023 phase 3)", () => {
  it("executes for the caller's current grant, within its limits, with the grant in the Trust Record", async () => {
    const trust = new TrustRecords();
    const transaction = await withTestApproval(release(50000), POLICY);

    const result = await runtime(
      new Grants(grant()),
      new RefusalRecords(),
      trust,
    ).execute(transaction);

    const authority = result.context.decision.assessment?.authority;
    expect(authority?.status).toBe(AuthorityStatus.AUTHORIZED);

    // Phase 4: the grant is signed into the authorization, so the gateway
    // can refuse the release once it expires or is revoked.
    expect(result.context.authorization?.payload.authorityGrant).toEqual({
      grantId: "grant-1",
      validUntil: authority?.grant?.validUntil.toISOString(),
    });
    expect(authority?.reason).toMatch(/holds authority grant grant-1/);
    expect(
      trust.created[0]?.executions[0]?.decision.assessment?.authority.grant,
    ).toMatchObject({
      grantId: "grant-1",
      callerId: "agent-x",
      limits: { "parameters.amount": { max: 100000 } },
    });
  });

  it.each([
    [
      "no grant",
      () => new Grants(null),
      50000,
      AuthorityStatus.NOT_AUTHORIZED,
      "authority-not-authorized",
    ],
    [
      "an expired grant",
      () => new Grants(grant({ validUntil: new Date(Date.now() - 1000) })),
      50000,
      AuthorityStatus.AUTHORITY_EXPIRED,
      "authority-expired",
    ],
    [
      "a request above the grant's limit",
      () => new Grants(grant()),
      100001,
      AuthorityStatus.NOT_AUTHORIZED,
      "authority-not-authorized",
    ],
    [
      "a grant for another caller",
      () => new Grants(grant({ callerId: "agent-y" })),
      50000,
      AuthorityStatus.NOT_AUTHORIZED,
      "authority-not-authorized",
    ],
    [
      "no grant registry",
      () => undefined,
      50000,
      AuthorityStatus.AUTHORITY_UNCLEAR,
      "authority-unclear",
    ],
  ])(
    "refuses with %s, in a Refusal Record, without validating or executing",
    async (_label, grants, amount, status, ruleId) => {
      const refusals = new RefusalRecords();
      const transaction = await withTestApproval(release(amount), POLICY);

      await expect(
        runtime(grants(), refusals).execute(transaction),
      ).rejects.toBeInstanceOf(RuntimeError);

      const decision = refusals.created[0]?.decision;
      expect(decision?.matchedRuleId).toBe(ruleId);
      expect(decision?.assessment).toMatchObject({
        authority: { status },
        businessValidation: { status: BusinessValidationStatus.NOT_EVALUATED },
        execution: {
          status: ExecutionAssessmentStatus.NOT_EXECUTED,
          reason: "Not executed: authority was not established.",
        },
      });
    },
  );

  it("refuses a request with no authenticated caller, asking no registry", async () => {
    const refusals = new RefusalRecords();
    const grants = new Grants(grant());
    const transaction = await withTestApproval(release(50000, null), POLICY);

    await expect(
      runtime(grants, refusals).execute(transaction),
    ).rejects.toBeInstanceOf(RuntimeError);

    expect(grants.calls).toBe(0);
    expect(refusals.created[0]?.decision.assessment?.authority.status).toBe(
      AuthorityStatus.NOT_AUTHORIZED,
    );
  });

  it("signs the expired grant into the Refusal Record, which fails verification if the status is changed", async () => {
    const refusals = new RefusalRecords();
    const transaction = await withTestApproval(release(50000), POLICY);

    await expect(
      runtime(
        new Grants(grant({ validUntil: new Date(Date.now() - 1000) })),
        refusals,
      ).execute(transaction),
    ).rejects.toBeInstanceOf(RuntimeError);

    const asReceived = JSON.parse(JSON.stringify(refusals.created[0]));
    const crypto = new RefusalCrypto();
    expect(await crypto.verify(asReceived)).toBe(true);
    expect(asReceived.decision.assessment.authority.grant.grantId).toBe(
      "grant-1",
    );

    asReceived.decision.assessment.authority.status = "AUTHORIZED";
    expect(await crypto.verify(asReceived)).toBe(false);
  });

  it("leaves a policy that does not require a grant as before", async () => {
    const grants = new Grants(null);
    const transaction = await withTestApproval(release(50000), {
      ...POLICY,
      requireAuthorityGrant: undefined,
    });

    const result = await new RuntimeBuilder()
      .withPolicyRepository(
        repository({ ...POLICY, requireAuthorityGrant: undefined }),
      )
      .withSignalStateVerifier(testApprovalSignalVerifier())
      .withAuthorityGrants(grants)
      .build(new TrustRecords(), new RefusalRecords())
      .execute(transaction);

    expect(grants.calls).toBe(0);
    expect(result.context.decision.assessment?.authority.status).toBe(
      AuthorityStatus.AUTHORIZED,
    );
    expect(result.context.decision.assessment?.authority.grant).toBeUndefined();
  });
});
