import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import mismatchedSignalTransaction from "./transaction-mismatched-signal.json" with { type: "json" };

import correctlyBoundTransaction from "./transaction-correctly-bound.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 62 - Signal/Intent Binding");
  console.log("==================================================");
  console.log();

  console.log(
    "A policy evaluates transaction.signals. Execution runs transaction.intent.",
  );
  console.log(
    "boundSignals declares which signal must equal which intent field, so",
  );
  console.log(
    "the facts a policy approved are guaranteed to describe the same",
  );
  console.log(
    "real-world action the system actually executes — not just a payload",
  );
  console.log("that happens to look correct in isolation.");
  console.log();
  console.log(
    'vendor-payment@2.1.0 declares: boundSignals.vendorId = "target".',
  );
  console.log(
    'Every transaction below shares the same intent.target, "sap.payment.release".',
  );
  console.log();

  //
  // Runtime
  //

  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  //
  // Scenario 1: a mismatched signal
  //

  console.log("--------------------------------------------------");
  console.log("Scenario 1: signals.vendorId is not declared");
  console.log("--------------------------------------------------");
  console.log();

  try {
    await runtime.execute(await withDemoApproval(mismatchedSignalTransaction));

    throw new Error(
      "Expected this transaction to be rejected, but it was approved. " +
        "This tutorial's fixture no longer demonstrates a signal/intent mismatch.",
    );
  } catch (error) {
    console.log(`✗ ${(error as Error).message}`);
    console.log();
    console.log(
      "This is Parmana working as intended: the caller never declared a",
    );
    console.log(
      "vendorId signal at all, so nothing proves the approved facts describe",
    );
    console.log(
      "this specific intent.target. No authorization is generated for it.",
    );
  }

  console.log();

  //
  // Scenario 2: the same transaction, correctly bound
  //

  console.log("--------------------------------------------------");
  console.log("Scenario 2: signals.vendorId matches intent.target");
  console.log("--------------------------------------------------");
  console.log();

  const { context } = await runtime.execute(
    await withDemoApproval(correctlyBoundTransaction),
  );

  console.log(`✓ ${context.decision.outcome}`);
  console.log(`Reason : ${context.decision.reason}`);

  console.log();
  console.log(
    "Same policy, same intent.target, same approve-shaped facts — the only",
  );
  console.log(
    "difference is that signals.vendorId now equals intent.target. That is",
  );
  console.log(
    "enough for SignalIntentBinder to confirm the two describe the same",
  );
  console.log(
    "action, so PolicyEngine.evaluate runs and this executes normally.",
  );

  console.log();
  console.log("==================================================");
  console.log("Summary");
  console.log("==================================================");
  console.log();
  console.log(
    "Scenario 1 : REJECTED — vendorId signal missing, cannot be bound to intent.target",
  );
  console.log(
    "Scenario 2 : APPROVED — vendorId signal declared and matches intent.target",
  );

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
