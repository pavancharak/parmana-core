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
} from "@parmana/policy";
import type { ApprovalScope, SignedApproval } from "@parmana/shared";

import { StaticApprovalIssuerRegistry } from "../../src/ApprovalIssuerRegistry.js";
import { ApprovalSignalVerifier } from "../../src/ApprovalSignalVerifier.js";
import { ApprovalVerifier } from "../../src/ApprovalVerifier.js";

/**
 * G-141: content an agent reads can carry instructions. The effect is
 * limited only if a write that content asks for cannot become approved
 * without a human signature. These tests play the injected instruction
 * as the agent would: an approval artifact the agent fabricates, edits,
 * redirects or replays. Each case first proves a legitimate human-signed
 * approval passes, so a refusal cannot come from a broken setup.
 */

const approverKeys = generateKeyPairSync("ed25519");
const agentKeys = generateKeyPairSync("ed25519");

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

async function signWith(
  privateKey: typeof approverKeys.privateKey,
  scope: ApprovalScope,
  resourceId = "order-1",
): Promise<SignedApproval> {
  return new ApprovalArtifactSigner().sign(
    {
      approverId: "approver-1",
      keyId: "approver-1-key-1",
      capability: "paytm:refund",
      resourceId,
      scope,
      ttlSeconds: 900,
    },
    privateKey,
  );
}

/** Arrives over HTTP as JSON, the same as a real request. */
function overTheWire(
  approval: SignedApproval,
): PolicySignals["approvalArtifact"] {
  return JSON.parse(JSON.stringify(approval));
}

const REFUND_SCOPE: ApprovalScope = {
  field: "value",
  comparator: "lte",
  value: 75_000,
};

const REFUND_POLICY = {
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

function refundRequest(): SignalStateVerificationRequest {
  return {
    action: "paytm:refund",
    businessTransactionId: "bt-injected-1",
    intentParameters: { orderId: "order-1", amount: 75_000 },
    stage: "authorize",
    policy: REFUND_POLICY,
  };
}

const REFUSED = {
  signalKey: "managerApproved",
  declaredValue: true,
  actualValue: false,
};

describe("an injected instruction cannot make a write approved (G-141)", () => {
  it("control: a human-signed approval for this refund passes", async () => {
    const verifier = setup();
    const approval = await signWith(approverKeys.privateKey, REFUND_SCOPE);

    expect(
      await verifier.findViolations(refundRequest(), {
        managerApproved: true,
        approvalArtifact: overTheWire(approval),
      }),
    ).toEqual([]);
  });

  it("refuses an approval the agent signs with its own key, even under an approver's id", async () => {
    const verifier = setup();
    const forged = await signWith(agentKeys.privateKey, REFUND_SCOPE);

    expect(
      await verifier.findViolations(refundRequest(), {
        managerApproved: true,
        approvalArtifact: overTheWire(forged),
      }),
    ).toEqual([REFUSED]);
  });

  it("refuses a human-signed approval whose scope the agent widened after signing", async () => {
    const verifier = setup();
    const signed = await signWith(approverKeys.privateKey, REFUND_SCOPE);
    const tampered = JSON.parse(JSON.stringify(signed)) as {
      payload: { scope: { value: number } };
    };

    // An injected instruction asks for a much larger limit.
    tampered.payload.scope.value = 10_000_000;

    expect(
      await verifier.findViolations(refundRequest(), {
        managerApproved: true,
        approvalArtifact:
          tampered as unknown as PolicySignals["approvalArtifact"],
      }),
    ).toEqual([REFUSED]);
  });

  it("refuses a human-signed approval for another order the injected text names", async () => {
    const verifier = setup();
    const approval = await signWith(
      approverKeys.privateKey,
      REFUND_SCOPE,
      "order-2",
    );

    expect(
      await verifier.findViolations(refundRequest(), {
        managerApproved: true,
        approvalArtifact: overTheWire(approval),
      }),
    ).toEqual([REFUSED]);
  });

  it("refuses a replay of an approval that already authorized one write", async () => {
    const verifier = setup();
    const approval = overTheWire(
      await signWith(approverKeys.privateKey, REFUND_SCOPE),
    );
    const signals = { managerApproved: true, approvalArtifact: approval };

    expect(await verifier.findViolations(refundRequest(), signals)).toEqual([]);
    expect(await verifier.findViolations(refundRequest(), signals)).toEqual([
      REFUSED,
    ]);
  });

  it("with no approval attached, the injected request stays refused", async () => {
    const verifier = setup();

    expect(
      await verifier.findViolations(refundRequest(), { managerApproved: true }),
    ).toEqual([REFUSED]);
  });
});
