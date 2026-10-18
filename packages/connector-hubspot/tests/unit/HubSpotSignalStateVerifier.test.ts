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
import { describe, expect, it } from "vitest";

import { HUBSPOT_DEAL_UPDATE_CAPABILITY } from "../../src/HubSpotCapabilities.js";
import { HubSpotSignalStateVerifier } from "../../src/HubSpotSignalStateVerifier.js";
import type { HubSpotDeal } from "../../src/HubSpotTypes.js";

/**
 * TD-23 closure, Phase 3C: preAuthorizedForAmountChange is now
 * independently verified against a real Approval Artifact rather than
 * trusted verbatim from the caller (see HubSpotSignalStateVerifier's
 * own verifyPreAuthorization). These tests exercise that path
 * directly, constructing HubSpotSignalStateVerifier the same way
 * every other test in this codebase constructs a SignalStateVerifier
 * directly, with a hand-built mock gateway standing in for the real
 * ExecutionSystem (this verifier's own deal-fetch call is stubbed out
 * entirely -- what is under test here is the preauth path, not the
 * deal-fetch/comparison path already covered by
 * hubspot-deal-update-signals.test.ts).
 */

const DEAL_ID = "9005";

function fakeDeal(
  overrides: Partial<HubSpotDeal["properties"]> = {},
): HubSpotDeal {
  return {
    id: DEAL_ID,
    properties: {
      dealstage: "appointmentscheduled",
      amount: "10000",
      ...overrides,
    },
  };
}

function mockGateway(deal: HubSpotDeal): ExecutionSystem {
  return {
    async execute() {
      return {
        businessTransactionId: "test",
        action: "hubspot:deal-fetch",
        target: `deals/${DEAL_ID}`,
        parameters: {},
        success: true,
        executedAt: new Date(),
        metadata: {
          connector: {
            responseSummary: {
              metadata: { deal },
            },
          },
        },
      };
    },
  };
}

const FAKE_KEYS: KeyProvider = {
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
  // Anchored to real wall-clock time, not a fixed past date: ApprovalVerifier.verify
  // defaults `now` to `new Date()`, so a hardcoded issuedAt/expiresAt eventually
  // becomes "expired" simply because real time caught up to it.
  const now = new Date();
  return {
    version: 1,
    approvalId: "approval-1",
    issuer: { approverId: "manager-jane", keyId: "manager-jane-key-1" },
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    capability: HUBSPOT_DEAL_UPDATE_CAPABILITY,
    resourceId: DEAL_ID,
    scope: { field: "amountDeltaAbs", comparator: "lte", value: 50_000 },
    nonce: "hubspot-nonce-1",
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
  businessTransactionId: "bt-1",
  intentParameters: { dealId: DEAL_ID },
};

describe("HubSpotSignalStateVerifier -- pre-authorization via Approval Artifact", () => {
  it("is unaffected when approvalVerifier is not configured (prior behavior unchanged)", async () => {
    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
    });

    // preAuthorizedForAmountChange declared true, no artifact at all --
    // without approvalVerifier configured this is not checked, exactly
    // as before this phase.
    const violations = await verifier.findViolations(
      REQUEST,
      baseSignals({ preAuthorizedForAmountChange: true }),
    );

    expect(violations).toEqual([]);
  });

  it("reports no violation when the caller correctly declares no pre-authorization and presents no artifact (no false positive)", async () => {
    const registry = new StaticApprovalIssuerRegistry([]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    // amountChangeExceedsThreshold is true (the request needs
    // pre-authorization), but the caller honestly declares false and
    // presents nothing -- this must not be reported as a violation;
    // the policy itself will reject the request on
    // amountChangeExceedsThreshold + preAuthorizedForAmountChange, not
    // on a manufactured signal mismatch.
    const violations = await verifier.findViolations(
      REQUEST,
      baseSignals({ preAuthorizedForAmountChange: false }),
    );

    expect(violations).toEqual([]);
  });

  it("approves a declared pre-authorization backed by a valid, matching Approval Artifact", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registry = new StaticApprovalIssuerRegistry([
      {
        approverId: "manager-jane",
        keyId: "manager-jane-key-1",
        publicKey,
        revoked: false,
      },
    ]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    const artifact = await signApproval(approvalPayload(), privateKey);

    const violations = await verifier.findViolations(
      REQUEST,
      baseSignals({
        preAuthorizedForAmountChange: true,
        approvalArtifact: artifact as unknown as PolicySignals[string],
      }),
    );

    expect(violations).toEqual([]);
  });

  it("rejects a declared pre-authorization with no approval artifact presented", async () => {
    const registry = new StaticApprovalIssuerRegistry([]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    const violations = await verifier.findViolations(
      REQUEST,
      baseSignals({ preAuthorizedForAmountChange: true }),
    );

    expect(violations).toEqual([
      {
        signalKey: "preAuthorizedForAmountChange",
        declaredValue: true,
        actualValue: false,
      },
    ]);
  });

  it("rejects a declared pre-authorization backed by an artifact from an unknown issuer", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const registry = new StaticApprovalIssuerRegistry([]); // issuer never registered
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    const artifact = await signApproval(approvalPayload(), privateKey);

    const violations = await verifier.findViolations(
      REQUEST,
      baseSignals({
        preAuthorizedForAmountChange: true,
        approvalArtifact: artifact as unknown as PolicySignals[string],
      }),
    );

    expect(violations).toEqual([
      {
        signalKey: "preAuthorizedForAmountChange",
        declaredValue: true,
        actualValue: false,
      },
    ]);
  });

  it("rejects an artifact approved for a smaller amount than the real requested delta (scope escalation)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registry = new StaticApprovalIssuerRegistry([
      {
        approverId: "manager-jane",
        keyId: "manager-jane-key-1",
        publicKey,
        revoked: false,
      },
    ]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    // Approved only up to 1,000 -- the real, independently re-derived
    // amountDeltaAbs (50,000, from baseSignals' deal fixture) far
    // exceeds it.
    const artifact = await signApproval(
      approvalPayload({
        scope: { field: "amountDeltaAbs", comparator: "lte", value: 1_000 },
      }),
      privateKey,
    );

    const violations = await verifier.findViolations(
      REQUEST,
      baseSignals({
        preAuthorizedForAmountChange: true,
        approvalArtifact: artifact as unknown as PolicySignals[string],
      }),
    );

    expect(violations).toEqual([
      {
        signalKey: "preAuthorizedForAmountChange",
        declaredValue: true,
        actualValue: false,
      },
    ]);
  });

  it("rejects an artifact issued for a different HubSpot deal (authorization transfer)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registry = new StaticApprovalIssuerRegistry([
      {
        approverId: "manager-jane",
        keyId: "manager-jane-key-1",
        publicKey,
        revoked: false,
      },
    ]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    const artifact = await signApproval(
      approvalPayload({ resourceId: "SOME-OTHER-DEAL" }),
      privateKey,
    );

    const violations = await verifier.findViolations(
      REQUEST,
      baseSignals({
        preAuthorizedForAmountChange: true,
        approvalArtifact: artifact as unknown as PolicySignals[string],
      }),
    );

    expect(violations).toEqual([
      {
        signalKey: "preAuthorizedForAmountChange",
        declaredValue: true,
        actualValue: false,
      },
    ]);
  });

  it("rejects a valid artifact whose second presentation is a replay (nonce already consumed)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registry = new StaticApprovalIssuerRegistry([
      {
        approverId: "manager-jane",
        keyId: "manager-jane-key-1",
        publicKey,
        revoked: false,
      },
    ]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    const artifact = await signApproval(approvalPayload(), privateKey);
    const signals = baseSignals({
      preAuthorizedForAmountChange: true,
      approvalArtifact: artifact as unknown as PolicySignals[string],
    });

    const first = await verifier.findViolations(REQUEST, signals);
    expect(first).toEqual([]);

    const second = await verifier.findViolations(REQUEST, signals);
    expect(second).toEqual([
      {
        signalKey: "preAuthorizedForAmountChange",
        declaredValue: true,
        actualValue: false,
      },
    ]);
  });

  it("does not consume the artifact's nonce when an unrelated violation exists on the same request", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registry = new StaticApprovalIssuerRegistry([
      {
        approverId: "manager-jane",
        keyId: "manager-jane-key-1",
        publicKey,
        revoked: false,
      },
    ]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    const artifact = await signApproval(approvalPayload(), privateKey);

    // First call: declare a currentDealStage that disagrees with the
    // real fetched deal -- an unrelated violation, so the approval
    // artifact must never be presented to ApprovalVerifier at all.
    const rejected = await verifier.findViolations(
      REQUEST,
      baseSignals({
        currentDealStage: "WRONG-STAGE",
        preAuthorizedForAmountChange: true,
        approvalArtifact: artifact as unknown as PolicySignals[string],
      }),
    );
    expect(rejected.some((v) => v.signalKey === "currentDealStage")).toBe(true);
    expect(
      rejected.some((v) => v.signalKey === "preAuthorizedForAmountChange"),
    ).toBe(false);

    // Second call: same artifact, corrected currentDealStage -- must
    // still succeed, proving the first call never burned the nonce.
    const corrected = await verifier.findViolations(
      REQUEST,
      baseSignals({
        preAuthorizedForAmountChange: true,
        approvalArtifact: artifact as unknown as PolicySignals[string],
      }),
    );
    expect(corrected).toEqual([]);
  });

  it("does not require or consume an artifact when the amount change does not exceed the threshold", async () => {
    const registry = new StaticApprovalIssuerRegistry([]);
    const approvalVerifier = new ApprovalVerifier({
      crypto,
      issuerRegistry: registry,
      nonceStore: new MemoryNonceStore(),
    });

    const verifier = new HubSpotSignalStateVerifier({
      gateway: mockGateway(fakeDeal()),
      keys: FAKE_KEYS,
      signerKeyId: "default",
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      crypto,
      approvalVerifier,
    });

    // No artifact, preAuthorizedForAmountChange declared false, and no
    // amount change requested at all -- amountChangeExceedsThreshold
    // is false, so preauth verification never runs.
    const violations = await verifier.findViolations(REQUEST, {
      currentDealStage: "appointmentscheduled",
      dealStageChangeRequested: false,
      dealStageTransitionAllowed: true,
      amountChangeRequested: false,
      amountDeltaAbs: 0,
      amountChangeExceedsThreshold: false,
      preAuthorizedForAmountChange: false,
    });

    expect(violations).toEqual([]);
  });
});
