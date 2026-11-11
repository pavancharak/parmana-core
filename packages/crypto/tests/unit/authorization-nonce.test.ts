import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthorizationSigner } from "../../src/AuthorizationSigner.js";
import { CryptoBootstrap } from "../../src/CryptoBootstrap.js";

/**
 * The nonce is the single-use token the release path consumes. These checks
 * keep it a random version-4 UUID, and distinct on every signature.
 */

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("authorization nonce", () => {
  it("is a random version-4 UUID and is distinct on every signature", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const signer = new AuthorizationSigner(CryptoBootstrap.create());
    const nonces = new Set<string>();

    for (let i = 0; i < 200; i += 1) {
      const authorization = await signer.sign(
        {
          decisionId: `decision-${i}`,
          decisionOutcome: "APPROVED",
          businessTransactionId: `txn-${i}`,
          policyName: "policy-a",
          policyVersion: "1.0.0",
          executableContent: {
            businessTransactionId: `txn-${i}`,
            action: "erp:create-invoice",
            target: "customer-42",
            parameters: { amount: 1 },
          },
        },
        privateKey,
        "key-1",
        60,
      );

      expect(authorization.payload.nonce).toMatch(UUID_V4);
      nonces.add(authorization.payload.nonce);
    }

    expect(nonces.size).toBe(200);
  });
});
