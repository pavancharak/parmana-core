import { generateKeyPairSync } from "node:crypto";

import { CryptoBootstrap, type KeyProvider } from "@parmana/crypto";
import {
  CompositeSignalStateVerifier,
  type PolicySignals,
  type SignalStateVerificationRequest,
  type SignalStateVerifier,
  type SignalStateViolation,
} from "@parmana/policy";
import type { ExecutionSystem } from "@parmana/execution-system";
import {
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  HubSpotSignalStateVerifier,
  type HubSpotDeal,
} from "@parmana/connector-hubspot";

//
// RuntimeEngine accepts exactly one SignalStateVerifier -- but a real
// deployment can have one independent, capability-scoped verifier per
// connector (Tutorial 71's HubSpotSignalStateVerifier is one real
// example). CompositeSignalStateVerifier is how those compose: each
// recognizes only its own action(s) and returns no violations for
// anything else, so the composite can query each in turn and let the
// one that actually understands a given request decide. This tutorial
// pairs the real HubSpotSignalStateVerifier with a second, minimal
// hand-written verifier (for a fictional "vendor:balance-check"
// capability) purely to demonstrate composition of two independent
// verifiers -- the second one is illustrative scaffolding, not a real
// connector.
//
const crypto = CryptoBootstrap.create();

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

// A stub gateway for HubSpot: any fetch returns a fixed, real deal.
const hubspotDeal: HubSpotDeal = {
  id: "9007",
  properties: { dealstage: "appointmentscheduled", amount: "10000" },
};
const hubspotGateway: ExecutionSystem = {
  async execute() {
    return {
      businessTransactionId: "tutorial-82",
      action: "hubspot:deal-fetch",
      target: "deals/9007",
      parameters: {},
      success: true,
      executedAt: new Date(),
      metadata: {
        connector: { responseSummary: { metadata: { deal: hubspotDeal } } },
      },
    } as never;
  },
};

const hubspotVerifier = new HubSpotSignalStateVerifier({
  gateway: hubspotGateway,
  keys: FAKE_KEYS,
  signerKeyId: "default",
  policyName: "hubspot-deal-update",
  policyVersion: "1.0.0",
  crypto,
});

// Illustrative second verifier: recognizes only "vendor:balance-check",
// independently re-derives a fixed "real" balance, and compares it to
// the caller-declared signal -- the same capability-scoped shape any
// real SignalStateVerifier follows, kept deliberately tiny here.
const REAL_BALANCE = 5_000;
const balanceVerifier: SignalStateVerifier = {
  async findViolations(request, signals) {
    if (request.action !== "vendor:balance-check") return [];

    const violations: SignalStateViolation[] = [];
    if (signals.declaredBalance !== REAL_BALANCE) {
      violations.push({
        signalKey: "declaredBalance",
        declaredValue: signals.declaredBalance,
        actualValue: REAL_BALANCE,
      });
    }
    return violations;
  },
};

const composite = new CompositeSignalStateVerifier([
  balanceVerifier,
  hubspotVerifier,
]);

console.log();
console.log("==================================================");
console.log("Tutorial 82 - Composite Signal-State Verification");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1: A vendor:balance-check request with a mismatched signal",
);
console.log("--------------------------------------------------");

const balanceRequest: SignalStateVerificationRequest = {
  action: "vendor:balance-check",
  businessTransactionId: "tutorial-82-balance",
  intentParameters: {},
};
const balanceSignals: PolicySignals = {
  declaredBalance: 9_999, // real state (from balanceVerifier) is 5,000
};

const balanceViolations = await composite.findViolations(
  balanceRequest,
  balanceSignals,
);
console.log(`Violations found : ${JSON.stringify(balanceViolations)}`);
console.log(
  `(Caught by balanceVerifier -- HubSpotSignalStateVerifier never even recognized this action)`,
);
console.log();

console.log(
  "Scenario 2: A hubspot:deal-update request with a mismatched signal",
);
console.log("--------------------------------------------------");

const hubspotRequest: SignalStateVerificationRequest = {
  action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
  businessTransactionId: "tutorial-82-hubspot",
  intentParameters: { dealId: "9007" },
};
const hubspotSignals: PolicySignals = {
  currentDealStage: "closedwon", // real state (from the stub gateway) is "appointmentscheduled"
  dealStageChangeRequested: false,
  dealStageTransitionAllowed: true,
  amountChangeRequested: false,
  amountDeltaAbs: 0,
  amountChangeExceedsThreshold: false,
  preAuthorizedForAmountChange: false,
};

const hubspotViolations = await composite.findViolations(
  hubspotRequest,
  hubspotSignals,
);
console.log(`Violations found : ${JSON.stringify(hubspotViolations)}`);
console.log(
  `(Caught by HubSpotSignalStateVerifier -- balanceVerifier never even recognized this action)`,
);
console.log();

console.log("Scenario 3: An unrelated action neither verifier recognizes");
console.log("--------------------------------------------------");

const unrelatedRequest: SignalStateVerificationRequest = {
  action: "payments:execute",
  businessTransactionId: "tutorial-82-unrelated",
  intentParameters: {},
};
const unrelatedViolations = await composite.findViolations(unrelatedRequest, {
  anything: true,
});
console.log(
  `Violations found : ${JSON.stringify(unrelatedViolations)} (neither verifier claims this action)`,
);
console.log();

const allPassed =
  balanceViolations.length === 1 &&
  balanceViolations[0]?.signalKey === "declaredBalance" &&
  hubspotViolations.length === 1 &&
  hubspotViolations[0]?.signalKey === "currentDealStage" &&
  unrelatedViolations.length === 0;

if (allPassed) {
  console.log(
    "✓ Each request was checked only by the verifier that actually understands its action -- no cross-contamination, no false positives.",
  );
} else {
  console.log(
    "✗ Expected each request to be caught by exactly its own capability-scoped verifier.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 83 - Capability/Policy Binding (TD-22)");
