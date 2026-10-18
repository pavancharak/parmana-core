import { FileKeyProvider } from "@parmana/crypto";

import {
  FilePolicyRepository,
  type PolicySignals,
  type SignalStateVerificationRequest,
  type SignalStateVerifier,
  type SignalStateViolation,
} from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { MemoryNonceStore } from "@parmana/envelope-verifier";

import { ExecutionGateway, type Connector } from "@parmana/execution-gateway";

import type { ExecutionRequest } from "@parmana/execution-system";

import { toExecutableContent, type ExecutionResult } from "@parmana/shared";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// A trivial Connector: this tutorial cares about whether the Execution
// Gateway forwards the request at all, not what a real enterprise system
// would do with it.
//
class RecordingConnector implements Connector {
  public invoked = false;

  async execute(): Promise<ExecutionResult> {
    this.invoked = true;
    return {
      businessTransactionId: transaction.businessTransactionId,
      action: transaction.intent.action,
      target: transaction.intent.target,
      parameters: transaction.intent.parameters,
      success: true,
      executedAt: new Date(),
      metadata: {},
    };
  }
}

//
// Represents a receiving system's independent live check performed at
// execution time, moments (or, over HTTP, minutes) after Parmana signed
// the authorization -- and finding nothing has changed since.
//
class NothingChangedVerifier implements SignalStateVerifier {
  async findViolations(): Promise<readonly SignalStateViolation[]> {
    return [];
  }
}

//
// Represents a different receiving system's independent live check,
// finding that the vendor -- verified when Parmana authorized this
// payment -- has since been blocked (e.g. a KYC re-review completed
// after authorization but before this system got around to executing).
// The declared signals and the authorization's signalsHash are
// completely unchanged; this is not a tampered request, just a stale one.
//
class VendorBlockedSinceAuthorizationVerifier implements SignalStateVerifier {
  async findViolations(
    _request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    if (signals.vendorVerified !== true) {
      return [];
    }

    return [
      {
        signalKey: "vendorVerified",
        declaredValue: true,
        actualValue: false,
      },
    ];
  }
}

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 98 - Signal-Freshness Enforcement (G-31)");
  console.log("==================================================");
  console.log();

  //
  // Build Runtime and authorize the payment, exactly as any earlier
  // tutorial does -- this is real production code, not a stand-in.
  //
  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  console.log("Authorizing payment...");

  // A person signs an approval for this payment; the agent attaches it.
  const approved = await withDemoApproval(transaction);

  const { context } = await runtime.execute(approved);

  if (!context.authorization) {
    throw new Error("Execution Authorization was not generated.");
  }

  const { authorization } = context;

  console.log("✓ Authorization signed.");
  console.log();
  console.log(`signalsHash : ${authorization.payload.signalsHash}`);
  console.log(
    "(a canonical hash of the transaction's own runtime signals -- new since G-31; older authorizations carry no such field)",
  );
  console.log();

  //
  // This authorization is a portable artifact: nothing about its
  // signature, expiry, or content hash requires it to be verified in
  // the same process, or the same instant, it was signed in. The rest
  // of this tutorial plays the role of two different receiving systems,
  // each independently verifying the exact same authorization and the
  // exact same declared signals -- only what they *find* differs.
  //
  const publicKey = await new FileKeyProvider().getPublicKey(
    authorization.keyId,
  );

  const request: ExecutionRequest = {
    ...toExecutableContent({
      businessTransactionId: transaction.businessTransactionId,
      action: transaction.intent.action,
      target: transaction.intent.target,
      parameters: transaction.intent.parameters,
    }),
    signals: approved.signals,
    authorization,
  };

  //
  // Receiving System A: checks again shortly after authorization.
  // Nothing has changed.
  //
  console.log("Receiving System A");
  console.log("--------------------------------------------------");

  const connectorA = new RecordingConnector();

  const gatewayA = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore: new MemoryNonceStore(),
    signalStateVerifier: new NothingChangedVerifier(),
    connector: connectorA,
  });

  await gatewayA.execute(request);

  console.log(
    `✓ Signals independently re-verified, unchanged. Connector invoked: ${connectorA.invoked}.`,
  );
  console.log();

  //
  // Receiving System B: checks later. The vendor has since been
  // blocked. Same authorization, same declared signals, same
  // signalsHash -- but this system's own live check disagrees with
  // what was true at authorization time.
  //
  console.log("Receiving System B");
  console.log("--------------------------------------------------");

  const connectorB = new RecordingConnector();

  const gatewayB = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore: new MemoryNonceStore(),
    signalStateVerifier: new VendorBlockedSinceAuthorizationVerifier(),
    connector: connectorB,
  });

  const { result } = await gatewayB.verify(request);

  console.log(`Valid                : ${result.valid}`);
  console.log(`Signature Verified   : ${result.checks.signatureVerified}`);
  console.log(`Signals Still Current: ${result.checks.signalsStillCurrent}`);
  console.log(
    `Divergence           : ${JSON.stringify(result.signalDivergence)}`,
  );
  console.log();

  try {
    await gatewayB.execute(request);
    console.log("✗ Expected execution to be rejected.");
  } catch (error) {
    console.log(
      `✓ Execution rejected before the connector was invoked: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  console.log(`Connector invoked: ${connectorB.invoked}.`);
  console.log();

  console.log("Summary");
  console.log("--------------------------------------------------");
  console.log(
    "• Authorization signature, expiry, and content hash are all still valid in both cases.",
  );
  console.log(
    "• The declared signals and their signed signalsHash are also unchanged in both cases.",
  );
  console.log(
    "• Only an independent, execution-time re-check of real-world state tells them apart.",
  );
  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
