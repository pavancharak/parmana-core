import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuditEventCrypto } from "@parmana/crypto";

//
// INC-7: caller-authentication audit events -- who authenticated,
// who was rejected, when, on which route -- are signed with the same
// root of trust as every other Parmana artifact (Trust Records,
// Receipts, Refusal Records: DEFAULT_KEY_ID). This tutorial exercises
// AuditEventCrypto directly, the same class production's
// SupabaseCallerAuditSink calls internally before ever writing a row.
//
console.log();
console.log("==================================================");
console.log("Tutorial 75 - Signed Audit Events");
console.log("==================================================");
console.log();

const keyDir = mkdtempSync(join(tmpdir(), "parmana-tutorial-75-keys-"));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(
  join(keyDir, "default.private.pem"),
  privateKey.export({ format: "pem", type: "pkcs8" }),
);
writeFileSync(
  join(keyDir, "default.public.pem"),
  publicKey.export({ format: "pem", type: "spki" }),
);
process.env.PARMANA_KEY_DIR = keyDir;

try {
  const crypto = new AuditEventCrypto();

  console.log("Scenario 1: A genuine caller-authenticated event");
  console.log("--------------------------------------------------");

  const authenticatedEvent = {
    type: "caller.authenticated" as const,
    occurredAt: new Date().toISOString(),
    route: "/execute",
    callerId: "caller-tutorial-75",
  };

  const signature = await crypto.sign(authenticatedEvent);
  console.log(`Signature algorithm : ${signature.algorithm}`);
  console.log(`Signed by keyId     : ${signature.keyId}`);

  const genuineValid = await crypto.verify(authenticatedEvent, signature);
  console.log(`Verifies as valid   : ${genuineValid}`);
  console.log();

  console.log("Scenario 2: The same event, tampered after signing");
  console.log("--------------------------------------------------");

  // An attacker who could rewrite the audit trail after the fact
  // would want to swap in a different callerId -- attributing the
  // authenticated call to someone else's identity.
  const tamperedEvent = {
    ...authenticatedEvent,
    callerId: "attacker-controlled-caller-id",
  };
  const tamperedValid = await crypto.verify(tamperedEvent, signature);
  console.log(`Original callerId : ${authenticatedEvent.callerId}`);
  console.log(`Tampered callerId : ${tamperedEvent.callerId}`);
  console.log(`Verifies as valid : ${tamperedValid}`);
  console.log();

  console.log(
    "Scenario 3: A genuine caller-rejected event (no credential ever included)",
  );
  console.log("--------------------------------------------------");

  const rejectedEvent = {
    type: "caller.rejected" as const,
    occurredAt: new Date().toISOString(),
    route: "/execute",
    reason: "unknown API key",
  };
  const rejectedSignature = await crypto.sign(rejectedEvent);
  const rejectedValid = await crypto.verify(rejectedEvent, rejectedSignature);
  console.log(
    `Fields on the event : ${Object.keys(rejectedEvent).join(", ")} (no credential/token field exists)`,
  );
  console.log(`Verifies as valid   : ${rejectedValid}`);
  console.log();

  const allPassed =
    genuineValid === true && tamperedValid === false && rejectedValid === true;

  if (allPassed) {
    console.log(
      "✓ Genuine audit events verify true; a tampered one is caught, not silently trusted.",
    );
  } else {
    console.log(
      "✗ Expected genuine events to verify true and the tampered event to verify false.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 76 - Caller Principal Scoping");
} finally {
  delete process.env.PARMANA_KEY_DIR;
  rmSync(keyDir, { recursive: true, force: true });
}
