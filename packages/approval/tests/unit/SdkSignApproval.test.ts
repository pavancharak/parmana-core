import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { SignedApproval } from "@parmana/shared";

// The SDK source, not the npm package: this checks the code about to ship.
import { signApproval } from "../../../../typescript/src/crypto/approval.js";

import { StaticApprovalIssuerRegistry } from "../../src/ApprovalIssuerRegistry.js";
import { ApprovalVerifier } from "../../src/ApprovalVerifier.js";

/**
 * An approval made by the TypeScript SDK's signApproval() passes the
 * server's own ApprovalVerifier, sent as JSON the way an agent sends it.
 */
describe("SDK signApproval() accepted by the server", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  const verifier = () =>
    new ApprovalVerifier({
      crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
      issuerRegistry: new StaticApprovalIssuerRegistry([
        {
          approverId: "manager-a",
          keyId: "manager-a-key-1",
          publicKey,
          revoked: false,
        },
      ]),
      nonceStore: new MemoryNonceStore(),
    });

  function sign(maxAmount?: number): SignedApproval {
    const approval = signApproval({
      privateKeyPem: String(
        privateKey.export({ type: "pkcs8", format: "pem" }),
      ),
      approverId: "manager-a",
      keyId: "manager-a-key-1",
      capability: "paytm:refund",
      resourceId: "ORD-7",
      ...(maxAmount !== undefined ? { maxAmount } : {}),
    });

    return JSON.parse(JSON.stringify(approval)) as SignedApproval;
  }

  it("verifies within the approved amount", async () => {
    const result = await verifier().verify(sign(50000), {
      action: "paytm:refund",
      resourceId: "ORD-7",
      requestedValue: 40000,
    });

    expect(result.valid).toBe(true);
  });

  it("refuses above the approved amount", async () => {
    const result = await verifier().verify(sign(50000), {
      action: "paytm:refund",
      resourceId: "ORD-7",
      requestedValue: 60000,
    });

    expect(result.valid).toBe(false);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.scopeSatisfied).toBe(false);
  });

  it("refuses a tampered payload", async () => {
    const approval = sign(50000);
    const tampered = {
      ...approval,
      payload: { ...approval.payload, resourceId: "ORD-8" },
    };

    const result = await verifier().verify(tampered, {
      action: "paytm:refund",
      resourceId: "ORD-8",
      requestedValue: 1,
    });

    expect(result.checks.signatureVerified).toBe(false);
  });
});
