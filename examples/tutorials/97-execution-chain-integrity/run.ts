import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  type Execution,
} from "@parmana/shared";

import { ExecutionChainCrypto, FileKeyExpiryStore } from "@parmana/crypto";

console.log();
console.log("==================================================");
console.log("Tutorial 97 - Execution Chain Integrity");
console.log("==================================================");
console.log();

//
// Part 1 -- ExecutionChainCrypto: a signed hash chain over the
// Executions belonging to one business transaction, so an actor with
// database UPDATE rights but not Parmana's private key cannot forge a
// replacement chain link (see packages/crypto/src/ExecutionChainCrypto.ts).
//

function draftExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    executionId: "exec-1",
    businessTransactionId: "txn-1",

    decision: {
      decisionId: "decision-1",
      intentId: "intent-1",
      policy: {
        name: "vendor-payment",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      },
      signals: { amount: 100 },
      outcome: DecisionOutcome.APPROVED,
      evaluatedAt: new Date("2026-08-01T00:00:00.000Z"),
    },

    status: ExecutionStatus.PROCESSING,
    mode: ExecutionMode.SYNC,
    startedAt: new Date("2026-08-01T00:00:00.000Z"),

    ...overrides,
  };
}

const chainCrypto = new ExecutionChainCrypto();

// First link: no predecessor.
const draft1 = draftExecution();
const chain1 = await chainCrypto.chain(draft1, null);
const execution1: Execution = { ...draft1, ...chain1 };

// Second link: chained to the first.
const draft2 = draftExecution({
  executionId: "exec-2",
  businessTransactionId: "txn-1",
});
const chain2 = await chainCrypto.chain(draft2, chain1.chainHash);
const execution2: Execution = { ...draft2, ...chain2 };

console.log("Chain Links");
console.log("--------------------------------------------------");
console.log(
  `Execution 1 : previousChainHash=${execution1.previousChainHash}  chainHash=${execution1.chainHash?.slice(0, 16)}...`,
);
console.log(
  `Execution 2 : previousChainHash=${execution2.previousChainHash?.slice(0, 16)}...  chainHash=${execution2.chainHash?.slice(0, 16)}...`,
);
console.log();

const validChain = await chainCrypto.verifyChain([execution1, execution2]);
console.log(`Valid chain verification : ${validChain.valid}`);

// Tamper with the first execution's status after chaining -- the kind
// of change an actor with DB write access (but not the private key)
// could attempt.
const tamperedExecution1: Execution = {
  ...execution1,
  status: ExecutionStatus.COMPLETED,
};

const tamperedChain = await chainCrypto.verifyChain([
  tamperedExecution1,
  execution2,
]);
console.log(
  `Tampered chain verification : ${tamperedChain.valid} (broken at ${tamperedChain.brokenAt}, reason: ${tamperedChain.reason})`,
);
console.log();

if (validChain.valid && !tamperedChain.valid) {
  console.log(
    "✓ Chain integrity holds: legitimate chain verifies, tampered chain is caught.",
  );
} else {
  console.log(
    "✗ Expected the valid chain to verify and the tampered one to fail.",
  );
}

console.log();

//
// Part 2 -- KeyExpiry: FileKeyExpiryStore reads a small sidecar
// key-expiry.json beside the PEM key files, so EnvelopeVerifier can
// fail closed on an expired or explicitly revoked key -- the exact
// mechanism that would have let Parmana revoke a compromised key
// immediately rather than only by rotating it (see docs/CLAIMS.md's
// "Key Compromise Notice").
//
// Uses an isolated temp key directory rather than the repository's
// real keys/ directory, so this tutorial never writes into production
// key material.
//
const tempKeyDir = mkdtempSync(join(tmpdir(), "parmana-key-expiry-"));

// The same key directory every other example signs with.
const sourceKeyDir = process.env.PARMANA_KEY_DIR ?? "keys";

try {
  copyFileSync(
    join(sourceKeyDir, "default.private.pem"),
    join(tempKeyDir, "default.private.pem"),
  );
  copyFileSync(
    join(sourceKeyDir, "default.public.pem"),
    join(tempKeyDir, "default.public.pem"),
  );

  writeFileSync(
    join(tempKeyDir, "key-expiry.json"),
    JSON.stringify({
      default: { revoked: true },
      "default-secondary": { expiresAt: "2020-01-01T00:00:00.000Z" },
    }),
  );

  const originalKeyDir = process.env.PARMANA_KEY_DIR;
  process.env.PARMANA_KEY_DIR = tempKeyDir;

  try {
    const expiryStore = new FileKeyExpiryStore();

    const revokedEntry = await expiryStore.get("default");
    const expiredEntry = await expiryStore.get("default-secondary");
    const unlistedEntry = await expiryStore.get("gateway");

    console.log("Key Expiry Lookups");
    console.log("--------------------------------------------------");
    console.log(
      `"default" (revoked in key-expiry.json)           : ${JSON.stringify(revokedEntry)}`,
    );
    console.log(
      `"default-secondary" (expired in key-expiry.json)  : ${JSON.stringify(expiredEntry)}`,
    );
    console.log(
      `"gateway" (absent from key-expiry.json)           : ${unlistedEntry === undefined ? "undefined (always valid)" : JSON.stringify(unlistedEntry)}`,
    );
    console.log();

    const isRevoked = revokedEntry?.revoked === true;
    const isExpired =
      (expiredEntry?.expiresAt?.getTime() ?? Infinity) < Date.now();

    if (isRevoked && isExpired && unlistedEntry === undefined) {
      console.log(
        "✓ Key expiry store correctly reports revoked/expired keys and treats an unlisted keyId as always valid.",
      );
    } else {
      console.log(
        "✗ Expected revoked/expired entries to be reported and an unlisted keyId to be undefined.",
      );
    }
  } finally {
    if (originalKeyDir === undefined) {
      delete process.env.PARMANA_KEY_DIR;
    } else {
      process.env.PARMANA_KEY_DIR = originalKeyDir;
    }
  }
} finally {
  rmSync(tempKeyDir, { recursive: true, force: true });
}

console.log();
console.log("Tutorial Complete");
