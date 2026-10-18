import crypto from "node:crypto";

import {
  DuplicateBusinessTransactionError,
  type BusinessTransaction,
} from "@parmana/shared";
import { MemoryBusinessTransactionRepository } from "@parmana/storage";

//
// G-1: two concurrent submissions of the identical businessTransactionId
// must never both succeed -- exactly one wins, the other gets a typed
// DuplicateBusinessTransactionError, and the stored transaction is
// never silently overwritten by whichever write happened to land
// second.
//
function buildTransaction(
  businessTransactionId: string,
  amount: number,
): BusinessTransaction {
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-78",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-78",
      displayName: "Tutorial 78",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Tutorial",
      authorizedAt: now,
    },
    intent: {
      intentId,
      authorizationId,
      action: "payments:execute",
      target: "vendor://payments",
      parameters: Object.freeze({ paymentId: "payment-001", amount }),
      createdAt: now,
    },
    policy: {
      name: "vendor-payment",
      version: "2.0.0",
      schemaVersion: "1.0.0",
    },
    signals: { amount },
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 78 - Duplicate Transaction Race");
console.log("==================================================");
console.log();

const repository = new MemoryBusinessTransactionRepository();

console.log("Scenario 1: A sequential duplicate (the simple case)");
console.log("--------------------------------------------------");

const first = buildTransaction("txn-tutorial-78-sequential", 1000);
await repository.create(first);
console.log("First create() succeeded.");

const second = buildTransaction("txn-tutorial-78-sequential", 999_999);
try {
  await repository.create(second);
  console.log("✗ Expected the second create() to be rejected.");
} catch (error) {
  console.log(
    `Second create() rejected : ${error instanceof DuplicateBusinessTransactionError ? "DuplicateBusinessTransactionError" : String(error)}`,
  );
}

const storedSequential = await repository.findById(
  "txn-tutorial-78-sequential",
);
console.log(
  `Stored amount : ${(storedSequential?.intent as { parameters: { amount: number } }).parameters.amount} (the first write, never overwritten)`,
);
console.log();

console.log(
  "Scenario 2: Two genuinely concurrent create() calls for the same id",
);
console.log("--------------------------------------------------");

const concurrentFirst = buildTransaction("txn-tutorial-78-race", 1000);
const concurrentSecond = buildTransaction("txn-tutorial-78-race", 999_999);

const results = await Promise.allSettled([
  repository.create(concurrentFirst),
  repository.create(concurrentSecond),
]);

const fulfilled = results.filter(
  (r): r is PromiseFulfilledResult<BusinessTransaction> =>
    r.status === "fulfilled",
);
const rejected = results.filter(
  (r): r is PromiseRejectedResult => r.status === "rejected",
);

console.log(`Fulfilled : ${fulfilled.length}`);
console.log(`Rejected  : ${rejected.length}`);
console.log(
  `Rejection is DuplicateBusinessTransactionError : ${rejected[0]?.reason instanceof DuplicateBusinessTransactionError}`,
);

const storedRace = await repository.findById("txn-tutorial-78-race");
const storedMatchesWinner =
  fulfilled[0] !== undefined &&
  JSON.stringify(storedRace) === JSON.stringify(fulfilled[0].value);
console.log(
  `Stored transaction exactly matches the winning create() call's return value : ${storedMatchesWinner}`,
);
console.log();

const allPassed =
  fulfilled.length === 1 &&
  rejected.length === 1 &&
  rejected[0]?.reason instanceof DuplicateBusinessTransactionError &&
  storedMatchesWinner;

if (allPassed) {
  console.log(
    "✓ Exactly one of the two concurrent create() calls succeeded -- never a silent overwrite, never both.",
  );
} else {
  console.log(
    "✗ Expected exactly one fulfilled create() and one DuplicateBusinessTransactionError rejection.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 79 - Storage Backend Selection");
