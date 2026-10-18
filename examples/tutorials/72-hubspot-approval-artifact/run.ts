import { generateKeyPairSync } from "node:crypto";

import {
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import {
  ArtifactSigner,
  CryptoBootstrap,
  type KeyProvider,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionSystem } from "@parmana/execution-system";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
} from "@parmana/policy";
import type { ApprovalPayload, SignedApproval } from "@parmana/shared";
import {
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  HubSpotSignalStateVerifier,
  type HubSpotDeal,
} from "@parmana/connector-hubspot";

//
// TD-23 Phase 3C: an over-threshold HubSpot amount change requires
// more than a caller's bare claim of "preAuthorizedForAmountChange:
// true" -- it requires a real, independently-issued, signed Approval
// Artifact from a trusted issuer, covering this exact deal and an
// amount at least as large as what's actually being requested.
//
// The production API (createApplication/createApprovalIssuerRegistry.ts)
// starts with ZERO trusted issuers configured -- fail-closed by
// default until an operator provisions a real approver key (see
// Tutorial 69's sibling denial case in the integration test suite).
// So this tutorial constructs HubSpotSignalStateVerifier directly,
// the same way its own unit test suite does, with a locally trusted
// issuer key it generates itself -- demonstrating the *mechanism*
// without needing production key provisioning.
//
const DEAL_ID = "9006";

function fakeDeal(): HubSpotDeal {
  return {
    id: DEAL_ID,
    properties: { dealstage: "appointmentscheduled", amount: "10000" },
  };
}

function stubGateway(deal: HubSpotDeal): ExecutionSystem {
  return {
    async execute() {
      return {
        businessTransactionId: "tutorial-72",
        action: "hubspot:deal-fetch",
        target: `deals/${DEAL_ID}`,
        parameters: {},
        success: true,
        executedAt: new Date(),
        metadata: {
          connector: { responseSummary: { metadata: { deal } } },
        },
      } as never;
    },
  };
}

const FAKE_SIGNING_KEYS: KeyProvider = {
  async getMetadata() {
    return { keyId: "default", algorithm: "ed25519" };
  },
  async getPrivateKey() {
    return generateKeyPairSync("ed25519").privateKey;
  },
  async getPublicKey() {
    return generateKeyPairSync("ed25519").publicKey;
  },
  async hasKey() {
    return true;
  },
};

const crypto = CryptoBootstrap.create();

async function signApproval(
  payload: ApprovalPayload,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
): Promise<SignedApproval> {
  const signer = new ArtifactSigner(crypto);
  const value = await signer.sign(payload, privateKey);
  return {
    payload,
    signature: {
      algorithm: crypto.signature.algorithm,
      keyId: payload.issuer.keyId,
      value,
      signedAt: new Date(),
    },
  };
}

function approvalPayload(
  overrides: Partial<ApprovalPayload> = {},
): ApprovalPayload {
  const now = new Date();
  return {
    version: 1,
    approvalId: "tutorial-72-approval",
    issuer: { approverId: "manager-jane", keyId: "manager-jane-key-1" },
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    capability: HUBSPOT_DEAL_UPDATE_CAPABILITY,
    resourceId: DEAL_ID,
    scope: { field: "amountDeltaAbs", comparator: "lte", value: 50_000 },
    nonce: "tutorial-72-nonce",
    ...overrides,
  };
}

function baseSignals(overrides: Partial<PolicySignals> = {}): PolicySignals {
  return {
    currentDealStage: "appointmentscheduled",
    dealStageChangeRequested: false,
    dealStageTransitionAllowed: true,
    amountChangeRequested: true,
    proposedAmount: 60_000,
    amountDeltaAbs: 50_000,
    amountChangeExceedsThreshold: true,
    preAuthorizedForAmountChange: false,
    ...overrides,
  };
}

const REQUEST: SignalStateVerificationRequest = {
  action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
  businessTransactionId: "tutorial-72-bt",
  intentParameters: { dealId: DEAL_ID },
};

console.log();
console.log("==================================================");
console.log("Tutorial 72 - HubSpot Approval Artifact");
console.log("==================================================");
console.log();

// A single trusted issuer, "manager-jane", with a real generated key
// pair -- standing in for an operator-provisioned approver.
const { privateKey: managerPrivateKey, publicKey: managerPublicKey } =
  generateKeyPairSync("ed25519");
const trustedRegistry = new StaticApprovalIssuerRegistry([
  {
    approverId: "manager-jane",
    keyId: "manager-jane-key-1",
    publicKey: managerPublicKey,
    revoked: false,
  },
]);

function buildVerifier(
  registry: StaticApprovalIssuerRegistry,
): HubSpotSignalStateVerifier {
  return new HubSpotSignalStateVerifier({
    gateway: stubGateway(fakeDeal()),
    keys: FAKE_SIGNING_KEYS,
    signerKeyId: "default",
    policyName: "hubspot-deal-update",
    policyVersion: "1.0.0",
    crypto,
    approvalVerifier: new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    }),
  });
}

console.log(
  "Scenario 1: Valid artifact from a trusted issuer, covering this deal and amount",
);
console.log("--------------------------------------------------");

const verifier1 = buildVerifier(trustedRegistry);
const validArtifact = await signApproval(approvalPayload(), managerPrivateKey);
const violations1 = await verifier1.findViolations(
  REQUEST,
  baseSignals({
    preAuthorizedForAmountChange: true,
    approvalArtifact: validArtifact as unknown as PolicySignals[string],
  }),
);
console.log(
  `Violations : ${violations1.length === 0 ? "none -- pre-authorization accepted" : JSON.stringify(violations1)}`,
);
console.log();

console.log(
  "Scenario 2: preAuthorizedForAmountChange declared true, but no artifact presented",
);
console.log("--------------------------------------------------");

const verifier2 = buildVerifier(trustedRegistry);
const violations2 = await verifier2.findViolations(
  REQUEST,
  baseSignals({ preAuthorizedForAmountChange: true }),
);
console.log(`Violations : ${JSON.stringify(violations2)}`);
console.log();

console.log(
  "Scenario 3: Well-formed, validly-signed artifact -- but from an issuer nobody trusts",
);
console.log("--------------------------------------------------");

const untrustedRegistry = new StaticApprovalIssuerRegistry([]); // "manager-jane" never registered here
const verifier3 = buildVerifier(untrustedRegistry);
const untrustedArtifact = await signApproval(
  approvalPayload(),
  managerPrivateKey,
);
const violations3 = await verifier3.findViolations(
  REQUEST,
  baseSignals({
    preAuthorizedForAmountChange: true,
    approvalArtifact: untrustedArtifact as unknown as PolicySignals[string],
  }),
);
console.log(`Violations : ${JSON.stringify(violations3)}`);
console.log();

console.log(
  "Scenario 4: Valid artifact, but approved for a smaller amount than actually requested",
);
console.log("--------------------------------------------------");

const verifier4 = buildVerifier(trustedRegistry);
const underscopedArtifact = await signApproval(
  approvalPayload({
    scope: { field: "amountDeltaAbs", comparator: "lte", value: 1_000 },
  }),
  managerPrivateKey,
);
const violations4 = await verifier4.findViolations(
  REQUEST,
  baseSignals({
    preAuthorizedForAmountChange: true,
    approvalArtifact: underscopedArtifact as unknown as PolicySignals[string],
  }),
);
console.log(`Violations : ${JSON.stringify(violations4)}`);
console.log();

const allPassed =
  violations1.length === 0 &&
  violations2.length === 1 &&
  violations2[0]?.signalKey === "preAuthorizedForAmountChange" &&
  violations3.length === 1 &&
  violations3[0]?.signalKey === "preAuthorizedForAmountChange" &&
  violations4.length === 1 &&
  violations4[0]?.signalKey === "preAuthorizedForAmountChange";

if (allPassed) {
  console.log(
    "✓ Only a valid, trusted, correctly-scoped Approval Artifact clears pre-authorization.",
  );
} else {
  console.log(
    "✗ Expected exactly one scenario (the trusted, correctly-scoped artifact) to pass.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 73 - Refusal Records");
