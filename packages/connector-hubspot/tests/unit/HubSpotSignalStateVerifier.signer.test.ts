import { generateKeyPairSync, type KeyObject } from "node:crypto";

import {
  CryptoBootstrap,
  SignatureVerifier,
  type KeyProvider,
  type Signer,
} from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
} from "@parmana/policy";
import type { SignedExecutionAuthorization } from "@parmana/shared";
import { describe, expect, it } from "vitest";

import { HUBSPOT_DEAL_UPDATE_CAPABILITY } from "../../src/HubSpotCapabilities.js";
import { HubSpotSignalStateVerifier } from "../../src/HubSpotSignalStateVerifier.js";
import type { HubSpotDeal } from "../../src/HubSpotTypes.js";

/**
 * The verifier signs its own deal fetch, and the gateway verifies that
 * signature against the deployment's signing key. With a Signer
 * (resolveSigner) the fetch is signed by whatever backend KEY_PROVIDER
 * selects, so it verifies under AWS KMS as well as local files. These
 * tests stand the gateway in with a stub that really checks the
 * signature against one public key, the way ExecutionGateway does.
 */

const crypto = CryptoBootstrap.create();
const DEAL_ID = "9005";

const deal: HubSpotDeal = {
  id: DEAL_ID,
  properties: { dealstage: "appointmentscheduled", amount: "10000" },
};

// Signals that match the deal above exactly, so any violation comes from
// the signing path, not from a signal mismatch.
const signals: PolicySignals = {
  currentDealStage: "appointmentscheduled",
  dealStageChangeRequested: false,
  dealStageTransitionAllowed: true,
  amountChangeRequested: false,
  amountDeltaAbs: 0,
  amountChangeExceedsThreshold: false,
  preAuthorizedForAmountChange: false,
};

const REQUEST: SignalStateVerificationRequest = {
  action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
  businessTransactionId: "bt-signer",
  intentParameters: { dealId: DEAL_ID },
};

/** A gateway that only answers when the authorization verifies. */
function verifyingGateway(publicKey: KeyObject): ExecutionSystem {
  const verifier = new SignatureVerifier(crypto);

  return {
    async execute(request) {
      const authorization =
        request.authorization as SignedExecutionAuthorization;
      const valid = await verifier.verify(
        authorization.payload,
        authorization.signature,
        publicKey,
      );

      if (!valid) {
        throw new Error("signature verification failed");
      }

      return {
        businessTransactionId: request.businessTransactionId,
        action: request.action,
        target: request.target,
        parameters: {},
        success: true,
        executedAt: new Date(),
        metadata: {
          connector: { responseSummary: { metadata: { deal } } },
        },
      };
    },
  };
}

/** A Signer that holds its key the way a KMS backend does: never released. */
function backendSigner(privateKey: KeyObject, publicKey: KeyObject) {
  const signedWith: string[] = [];
  const signer: Signer = {
    async sign(keyId, data) {
      signedWith.push(keyId);
      return crypto.signature.sign(data, privateKey);
    },
    async getPublicKey() {
      return publicKey;
    },
    async getMetadata(keyId) {
      return { keyId, algorithm: "ed25519" };
    },
    async hasKey() {
      return true;
    },
  };
  return { signer, signedWith };
}

function verifierWith(
  gateway: ExecutionSystem,
  signing: { resolveSigner?: () => Promise<Signer>; keys?: KeyProvider },
): HubSpotSignalStateVerifier {
  return new HubSpotSignalStateVerifier({
    gateway,
    ...signing,
    signerKeyId: "default",
    policyName: "hubspot-deal-update",
    policyVersion: "1.0.0",
    crypto,
  });
}

describe("HubSpotSignalStateVerifier -- signing through a Signer", () => {
  it("signs the fetch through the Signer, and the gateway accepts it", async () => {
    const deployment = generateKeyPairSync("ed25519");
    const { signer, signedWith } = backendSigner(
      deployment.privateKey,
      deployment.publicKey,
    );

    const verifier = verifierWith(verifyingGateway(deployment.publicKey), {
      resolveSigner: async () => signer,
    });

    await expect(verifier.findViolations(REQUEST, signals)).resolves.toEqual(
      [],
    );
    expect(signedWith).toEqual(["default"]);
  });

  it("fails closed when the fetch is signed with a key the gateway does not verify against", async () => {
    // The pre-fix production shape: a local key file signing, while the
    // gateway verifies against the KMS key.
    const deployment = generateKeyPairSync("ed25519");
    const localFile = generateKeyPairSync("ed25519");

    const verifier = verifierWith(verifyingGateway(deployment.publicKey), {
      keys: {
        async getMetadata() {
          return { keyId: "default", algorithm: "ed25519" };
        },
        async getPrivateKey() {
          return localFile.privateKey;
        },
        async getPublicKey() {
          return localFile.publicKey;
        },
        async hasKey() {
          return true;
        },
      },
    });

    const violations = await verifier.findViolations(REQUEST, signals);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.signalKey).toBe("hubspot:deal-fetch");
    expect(String(violations[0]?.actualValue)).toContain(
      "signature verification failed",
    );
  });

  it("fails closed when the Signer cannot be resolved", async () => {
    const deployment = generateKeyPairSync("ed25519");

    const verifier = verifierWith(verifyingGateway(deployment.publicKey), {
      resolveSigner: async () => {
        throw new Error("KMS unreachable");
      },
    });

    const violations = await verifier.findViolations(REQUEST, signals);

    expect(violations).toHaveLength(1);
    expect(String(violations[0]?.actualValue)).toContain("KMS unreachable");
  });

  it("refuses construction with neither or both signing options", () => {
    const gateway = verifyingGateway(generateKeyPairSync("ed25519").publicKey);
    const keys = {} as KeyProvider;
    const resolveSigner = async () => ({}) as Signer;

    expect(() => verifierWith(gateway, {})).toThrow(
      "exactly one of resolveSigner or keys",
    );
    expect(() => verifierWith(gateway, { keys, resolveSigner })).toThrow(
      "exactly one of resolveSigner or keys",
    );
  });
});
