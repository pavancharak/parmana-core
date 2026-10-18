import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CryptoBootstrap,
  FileKeyProvider,
  SignatureVerifier,
  type Signer,
} from "@parmana/crypto";
import {
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  HubSpotSignalStateVerifier,
  type HubSpotDeal,
} from "@parmana/connector-hubspot";
import type { ExecutionSystem } from "@parmana/execution-system";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
} from "@parmana/policy";
import type { SignedExecutionAuthorization } from "@parmana/shared";

//
// Before a hubspot:deal-update is authorized, HubSpotSignalStateVerifier
// fetches the real deal through the gateway to check the caller's
// signals. That fetch carries its own signed authorization, and the
// gateway verifies it against the deployment's signing key.
//
// The bug: packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts
// signed that fetch with `new FileKeyProvider()`, the local key file,
// whatever KEY_PROVIDER said. Under KEY_PROVIDER=aws-kms the gateway
// verifies against the KMS key, so the two keys differ, the fetch is
// refused, and every hubspot:deal-update is refused with it (it fails
// closed, so nothing unsafe runs, but the capability cannot work).
//
// The fix: the verifier takes `resolveSigner`, and production wiring
// resolves the Signer SignerBootstrap selects from KEY_PROVIDER, the
// same Signer RuntimeAuthorizationSigner and the gateway use. A Signer
// signs without releasing its private key, so it works for KMS too.
//
// Hermetic: no AWS. An in memory Signer that never releases its key
// stands in for KMS, and a stub gateway really checks each signature.
//

const crypto = CryptoBootstrap.create();
const DEAL_ID = "9005";

const deal: HubSpotDeal = {
  id: DEAL_ID,
  properties: { dealstage: "appointmentscheduled", amount: "10000" },
};

const signals: PolicySignals = {
  currentDealStage: "appointmentscheduled",
  dealStageChangeRequested: false,
  dealStageTransitionAllowed: true,
  amountChangeRequested: false,
  amountDeltaAbs: 0,
  amountChangeExceedsThreshold: false,
  preAuthorizedForAmountChange: false,
};

const request: SignalStateVerificationRequest = {
  action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
  businessTransactionId: "tutorial-118",
  intentParameters: { dealId: DEAL_ID },
};

// The deployment's signing key, held the way KMS holds it: only this
// Signer can use it, and it never hands out the private key.
const kms = generateKeyPairSync("ed25519");
let kmsSignatures = 0;
const kmsSigner: Signer = {
  async sign(_keyId, data) {
    kmsSignatures += 1;
    return crypto.signature.sign(data, kms.privateKey);
  },
  async getPublicKey() {
    return kms.publicKey;
  },
  async getMetadata(keyId) {
    return { keyId, algorithm: "ed25519" };
  },
  async hasKey() {
    return true;
  },
};

// A stand in for ExecutionGateway: it answers only when the fetch's
// authorization verifies against the deployment key.
function gatewayVerifyingAgainst(publicKey: KeyObject): ExecutionSystem {
  const verifier = new SignatureVerifier(crypto);

  return {
    async execute(executionRequest) {
      const authorization =
        executionRequest.authorization as SignedExecutionAuthorization;
      const valid = await verifier.verify(
        authorization.payload,
        authorization.signature,
        publicKey,
      );

      if (!valid) {
        throw new Error(
          "Execution Gateway rejected request: signature verification failed",
        );
      }

      return {
        businessTransactionId: executionRequest.businessTransactionId,
        action: executionRequest.action,
        target: executionRequest.target,
        parameters: {},
        success: true,
        executedAt: new Date(),
        metadata: { connector: { responseSummary: { metadata: { deal } } } },
      };
    },
  };
}

// A local key directory with its own "default" key pair, as a server
// still has one on disk after moving to KMS.
const keyDir = mkdtempSync(join(tmpdir(), "parmana-tutorial-118-keys-"));
const previousKeyDir = process.env.PARMANA_KEY_DIR;
process.env.PARMANA_KEY_DIR = keyDir;

try {
  const localFile = generateKeyPairSync("ed25519");
  writeFileSync(
    join(keyDir, "default.private.pem"),
    localFile.privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  writeFileSync(
    join(keyDir, "default.public.pem"),
    localFile.publicKey.export({ format: "pem", type: "spki" }),
  );

  const gateway = gatewayVerifyingAgainst(kms.publicKey);
  const common = {
    gateway,
    signerKeyId: "default",
    policyName: "hubspot-deal-update",
    policyVersion: "1.0.0",
    crypto,
  };

  console.log(
    "Tutorial 118: the HubSpot state check signs with the configured key",
  );
  console.log();

  console.log("Scenario 1: the old wiring, keys: new FileKeyProvider()");
  const before = await new HubSpotSignalStateVerifier({
    ...common,
    keys: new FileKeyProvider(),
  }).findViolations(request, signals);
  console.log(`  violations: ${before.length}`);
  for (const violation of before) {
    console.log(`  ${violation.signalKey}: ${String(violation.actualValue)}`);
  }
  console.log(
    "  The fetch was signed with the local file key; the gateway verifies against KMS.",
  );
  console.log();

  console.log(
    "Scenario 2: the fix, resolveSigner returning the configured Signer",
  );
  const after = await new HubSpotSignalStateVerifier({
    ...common,
    resolveSigner: async () => kmsSigner,
  }).findViolations(request, signals);
  console.log(`  violations: ${after.length}`);
  console.log(`  signatures made by the KMS style Signer: ${kmsSignatures}`);
  console.log(
    "  The fetch was signed by the same key the gateway verifies, so the deal state is checked.",
  );
  console.log();

  const passed =
    before.length === 1 &&
    before[0]?.signalKey === "hubspot:deal-fetch" &&
    after.length === 0 &&
    kmsSignatures === 1;

  if (!passed) {
    console.log("✗ Expected scenario 1 to be refused and scenario 2 to pass.");
    process.exitCode = 1;
  } else {
    console.log(
      "✓ The old wiring is refused under a KMS key; signing through the Signer is accepted.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 119 - Human Approval for One Action");
} finally {
  if (previousKeyDir === undefined) {
    delete process.env.PARMANA_KEY_DIR;
  } else {
    process.env.PARMANA_KEY_DIR = previousKeyDir;
  }
  rmSync(keyDir, { recursive: true, force: true });
}
