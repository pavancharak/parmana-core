import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  PolicyEngine,
  PolicyOutcome,
  type Policy,
  type PolicySignals,
  type SignalStateVerificationRequest,
} from "@parmana/policy";
import type { ApprovalScope, SignedApproval } from "@parmana/shared";

import { ApprovalSignalVerifier } from "../../src/ApprovalSignalVerifier.js";
import { ApprovalVerifier } from "../../src/ApprovalVerifier.js";
import { StaticApprovalIssuerRegistry } from "../../src/ApprovalIssuerRegistry.js";

/**
 * github-pr-comment 1.0.0, verified end to end: two signed approvals, one
 * for the target pull request and one for the exact comment text, are
 * checked by the approval verifier. The policy then decides on the signals
 * the verifier leaves true.
 */

const CAPABILITY = "github:comment";
const TARGET = "acme/api#42";
const BODY = "Approved: deploy the 2026-11 billing fix.";

const approverKeys = generateKeyPairSync("ed25519");

const POLICY = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../policies/github-pr-comment/1.0.0/policy.json",
    ),
    "utf8",
  ),
) as Policy;

function setup() {
  const approvalVerifier = new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: new StaticApprovalIssuerRegistry([
      {
        approverId: "approver-1",
        keyId: "approver-1-key-1",
        publicKey: approverKeys.publicKey,
        revoked: false,
        capabilities: [CAPABILITY],
      },
    ]),
    nonceStore: new MemoryNonceStore(),
  });

  return {
    verifier: new ApprovalSignalVerifier(approvalVerifier),
    engine: new PolicyEngine(),
  };
}

async function sign(
  resourceId: string,
  scope: ApprovalScope,
  capability: string = CAPABILITY,
): Promise<PolicySignals["targetApprovalArtifact"]> {
  const approval: SignedApproval = await new ApprovalArtifactSigner().sign(
    {
      approverId: "approver-1",
      keyId: "approver-1-key-1",
      capability,
      resourceId,
      scope,
      ttlSeconds: 900,
    },
    approverKeys.privateKey,
  );

  // Arrives over HTTP as JSON.
  return JSON.parse(JSON.stringify(approval));
}

const targetScope = (value: string): ApprovalScope => ({
  field: "resourceId",
  comparator: "eq",
  value,
});

function request(
  overrides: Partial<SignalStateVerificationRequest> = {},
): SignalStateVerificationRequest {
  return {
    action: CAPABILITY,
    businessTransactionId: "btx-1",
    intentTarget: TARGET,
    intentParameters: { body: BODY },
    stage: "authorize",
    policy: POLICY,
    ...overrides,
  };
}

/**
 * Runs the verifier, then the policy. A declared signal the verifier refuses
 * is set to false before the policy decides, as the gateway does.
 */
async function decide(
  engine: PolicyEngine,
  verifier: ApprovalSignalVerifier,
  req: SignalStateVerificationRequest,
  signals: PolicySignals,
) {
  const violations = await verifier.findViolations(req, signals);
  const refused = new Set(violations.map((v) => v.signalKey));
  const effective: PolicySignals = {
    ...signals,
    targetApproved:
      signals.targetApproved === true && !refused.has("targetApproved"),
    bodyApproved: signals.bodyApproved === true && !refused.has("bodyApproved"),
  };
  const decision = engine.evaluate(POLICY, effective);
  return { violations, outcome: decision.outcome };
}

describe("github-pr-comment 1.0.0 with the approval verifier", () => {
  it("approves when both approvals are valid for this pull request and this body", async () => {
    const { verifier, engine } = setup();

    const result = await decide(engine, verifier, request(), {
      targetApproved: true,
      bodyApproved: true,
      targetApprovalArtifact: await sign(TARGET, targetScope(TARGET)),
      bodyApprovalArtifact: await sign(BODY, targetScope(BODY)),
    });

    expect(result.violations).toEqual([]);
    expect(result.outcome).toBe(PolicyOutcome.APPROVE);
  });

  it("rejects when only the target approval is present", async () => {
    const { verifier, engine } = setup();

    const result = await decide(engine, verifier, request(), {
      targetApproved: true,
      bodyApproved: false,
      targetApprovalArtifact: await sign(TARGET, targetScope(TARGET)),
    });

    expect(result.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("rejects when only the body approval is present", async () => {
    const { verifier, engine } = setup();

    const result = await decide(engine, verifier, request(), {
      targetApproved: false,
      bodyApproved: true,
      bodyApprovalArtifact: await sign(BODY, targetScope(BODY)),
    });

    expect(result.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("refuses a body approval for different text, so a different body does not pass", async () => {
    const { verifier, engine } = setup();

    const result = await decide(
      engine,
      verifier,
      request({
        intentParameters: { body: "Approved: drop the users table." },
      }),
      {
        targetApproved: true,
        bodyApproved: true,
        targetApprovalArtifact: await sign(TARGET, targetScope(TARGET)),
        bodyApprovalArtifact: await sign(BODY, targetScope(BODY)),
      },
    );

    expect(result.violations).toEqual([
      { signalKey: "bodyApproved", declaredValue: true, actualValue: false },
    ]);
    expect(result.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("refuses a target approval for another pull request", async () => {
    const { verifier, engine } = setup();

    const result = await decide(engine, verifier, request(), {
      targetApproved: true,
      bodyApproved: true,
      targetApprovalArtifact: await sign(
        "acme/api#43",
        targetScope("acme/api#43"),
      ),
      bodyApprovalArtifact: await sign(BODY, targetScope(BODY)),
    });

    expect(result.violations).toEqual([
      { signalKey: "targetApproved", declaredValue: true, actualValue: false },
    ]);
    expect(result.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("refuses an approval for another capability", async () => {
    const { verifier, engine } = setup();

    const result = await decide(engine, verifier, request(), {
      targetApproved: true,
      bodyApproved: true,
      targetApprovalArtifact: await sign(
        TARGET,
        targetScope(TARGET),
        "github:pr-merge",
      ),
      bodyApprovalArtifact: await sign(BODY, targetScope(BODY)),
    });

    expect(result.violations.map((v) => v.signalKey)).toContain(
      "targetApproved",
    );
    expect(result.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("refuses a body approval whose scope is a number, not the exact text", async () => {
    const { verifier, engine } = setup();

    const result = await decide(engine, verifier, request(), {
      targetApproved: true,
      bodyApproved: true,
      targetApprovalArtifact: await sign(TARGET, targetScope(TARGET)),
      bodyApprovalArtifact: await sign(BODY, {
        field: "value",
        comparator: "lte",
        value: 4000,
      }),
    });

    expect(result.violations.map((v) => v.signalKey)).toContain("bodyApproved");
    expect(result.outcome).toBe(PolicyOutcome.REJECT);
  });

  it("refuses an approval that has already been used for another comment", async () => {
    const { verifier, engine } = setup();
    const signals: PolicySignals = {
      targetApproved: true,
      bodyApproved: true,
      targetApprovalArtifact: await sign(TARGET, targetScope(TARGET)),
      bodyApprovalArtifact: await sign(BODY, targetScope(BODY)),
    };

    const first = await decide(engine, verifier, request(), signals);
    expect(first.outcome).toBe(PolicyOutcome.APPROVE);

    const second = await decide(
      engine,
      verifier,
      request({ businessTransactionId: "btx-2" }),
      signals,
    );
    expect(second.violations.map((v) => v.signalKey)).toContain(
      "targetApproved",
    );
    expect(second.outcome).toBe(PolicyOutcome.REJECT);
  });
});
