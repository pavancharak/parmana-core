import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type {
  Policy,
  PolicySignals,
  SignalStateVerificationRequest,
  UsedApproval,
} from "@parmana/policy";
import type { ApprovalScope, SignedApproval } from "@parmana/shared";

import { StaticApprovalIssuerRegistry } from "../../src/ApprovalIssuerRegistry.js";
import { ApprovalSignalVerifier } from "../../src/ApprovalSignalVerifier.js";
import { ApprovalVerifier } from "../../src/ApprovalVerifier.js";

/** G-143: the verifier reports the approval it accepted, and only that. */

const approverKeys = generateKeyPairSync("ed25519");

function setup() {
  const approvalVerifier = new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: new StaticApprovalIssuerRegistry([
      {
        approverId: "approver-1",
        keyId: "approver-1-key-1",
        publicKey: approverKeys.publicKey,
        revoked: false,
      },
    ]),
    nonceStore: new MemoryNonceStore(),
  });
  return new ApprovalSignalVerifier(approvalVerifier);
}

async function sign(scope: ApprovalScope): Promise<SignedApproval> {
  const approval = await new ApprovalArtifactSigner().sign(
    {
      approverId: "approver-1",
      keyId: "approver-1-key-1",
      capability: "paytm:refund",
      resourceId: "order-1",
      scope,
      ttlSeconds: 900,
    },
    approverKeys.privateKey,
  );
  return JSON.parse(JSON.stringify(approval));
}

const POLICY = {
  policyId: "test-policy",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  approvalSignals: {
    managerApproved: {
      resourceId: "parameters.orderId",
      value: "parameters.amount",
    },
  },
  rules: [],
} as unknown as Policy;

function request(
  usedApprovals: UsedApproval[],
  overrides: Partial<SignalStateVerificationRequest> = {},
): SignalStateVerificationRequest {
  return {
    action: "paytm:refund",
    businessTransactionId: "bt-used-1",
    intentParameters: { orderId: "order-1", amount: 75_000 },
    stage: "authorize",
    policy: POLICY,
    usedApprovals: { add: (approval) => usedApprovals.push(approval) },
    ...overrides,
  };
}

describe("ApprovalSignalVerifier reports the approval it accepted (G-143)", () => {
  it("reports approver, key, approval id and time for an accepted approval", async () => {
    const verifier = setup();
    const used: UsedApproval[] = [];
    const artifact = await sign({
      field: "value",
      comparator: "lte",
      value: 75_000,
    });

    const violations = await verifier.findViolations(request(used), {
      managerApproved: true,
      approvalArtifact: JSON.parse(JSON.stringify(artifact)),
    } as PolicySignals);

    expect(violations).toEqual([]);
    expect(used).toHaveLength(1);
    expect(used[0]).toEqual({
      signalKey: "managerApproved",
      approvalId: artifact.payload.approvalId,
      approverId: "approver-1",
      keyId: "approver-1-key-1",
      issuedAt: artifact.payload.issuedAt,
    });
  });

  it("reports nothing for a refused approval", async () => {
    const verifier = setup();
    const used: UsedApproval[] = [];
    const artifact = await sign({
      field: "value",
      comparator: "lte",
      value: 10,
    });

    const violations = await verifier.findViolations(request(used), {
      managerApproved: true,
      approvalArtifact: JSON.parse(JSON.stringify(artifact)),
    } as PolicySignals);

    expect(violations).toHaveLength(1);
    expect(used).toEqual([]);
  });

  it("works without a collector, as before", async () => {
    const verifier = setup();
    const artifact = await sign({
      field: "value",
      comparator: "lte",
      value: 75_000,
    });
    const violations = await verifier.findViolations(
      { ...request([]), usedApprovals: undefined },
      {
        managerApproved: true,
        approvalArtifact: JSON.parse(JSON.stringify(artifact)),
      } as PolicySignals,
    );
    expect(violations).toEqual([]);
  });
});
