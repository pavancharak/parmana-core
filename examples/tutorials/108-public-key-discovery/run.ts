import {
  VerificationCrypto,
  verifyExecutionTrustRecordOffline,
} from "@parmana/crypto";
import type { ExecutionTrustRecord } from "@parmana/shared";

//
// PQC audit RED-2 (docs/VERIFICATION-GAPS.md): before GET /keys/:keyId
// and GET /.well-known/jwks.json existed, no route anywhere in
// packages/api/src/routes/ let a third party fetch Parmana's public
// key at all -- even a perfect offline verifier (Tutorial 107) is
// useless to someone with no way to obtain the key it needs. Both
// routes are mounted ahead of caller-auth (packages/api/src/app.ts),
// the same category as POST /refusal/verify and POST /audit/verify: a
// credential-gated route cannot be how a party with no Parmana
// credential gets the credential-free key it needs.
//
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");

console.log();
console.log("==================================================");
console.log("Tutorial 108 - Public-Key Discovery");
console.log("==================================================");
console.log();

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem);
const app = createApp(application, { callerAuth: "disabled" });

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

try {
  console.log(
    "Scenario 1: GET /keys/default, unauthenticated, returns the real public key",
  );
  console.log("--------------------------------------------------");

  const keyResponse = await fetch(`${baseUrl}/keys/default`);
  const key = (await keyResponse.json()) as {
    keyId: string;
    algorithm: string;
    pem: string;
    jwk?: unknown;
  };

  console.log(`Status    : ${keyResponse.status}`);
  console.log(`keyId     : ${key.keyId}`);
  console.log(`algorithm : ${key.algorithm}`);
  console.log(`pem       : ${key.pem.split("\n")[0]}...`);
  console.log(`has jwk   : ${key.jwk !== undefined}`);
  console.log();

  console.log(
    "Scenario 2: GET /.well-known/jwks.json lists every key this deployment holds",
  );
  console.log("--------------------------------------------------");

  const jwksResponse = await fetch(`${baseUrl}/.well-known/jwks.json`);
  const jwks = (await jwksResponse.json()) as {
    keys: Array<{ keyId: string }>;
  };

  console.log(`Status    : ${jwksResponse.status}`);
  console.log(`Key count : ${jwks.keys.length}`);
  console.log(
    `Key IDs   : ${jwks.keys.map((entry) => entry.keyId).join(", ")}`,
  );
  console.log();

  console.log(
    "Scenario 3: GET /keys/:keyId returns 404 for an unknown key, not a silent empty result",
  );
  console.log("--------------------------------------------------");

  const missingResponse = await fetch(`${baseUrl}/keys/does-not-exist`);
  console.log(`Status : ${missingResponse.status}`);
  console.log();

  console.log(
    "Scenario 4: The full chain -- fetch a key over HTTP, then verify a real record with zero further server calls (RED-1 + RED-2 combined)",
  );
  console.log("--------------------------------------------------");

  const crypto = new VerificationCrypto();

  const draft = {
    trustRecordId: "public-key-discovery-demo",
    businessTransactionId: "public-key-discovery-demo",
    transaction: {
      businessTransactionId: "public-key-discovery-demo",
      status: "RECEIVED",
      createdAt: new Date(),
    },
    overrides: [],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ExecutionTrustRecord;

  const trustRecordHash = await crypto.hash(draft);

  const withHash: ExecutionTrustRecord = {
    ...draft,
    trustRecordHash,
    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "",
      signedAt: new Date(),
    },
  };

  const signature = await crypto.sign(withHash);
  const trustRecord: ExecutionTrustRecord = { ...withHash, signature };

  // From here on, no further reference to baseUrl, the server, or any
  // Parmana process at all -- only the record and the PEM string
  // fetched in Scenario 1.
  const offlineResult = await verifyExecutionTrustRecordOffline(trustRecord, {
    default: key.pem,
  });

  console.log(`valid : ${offlineResult.valid}`);
  console.log();

  const allCorrect =
    keyResponse.status === 200 &&
    jwksResponse.status === 200 &&
    jwks.keys.some((entry) => entry.keyId === "default") &&
    missingResponse.status === 404 &&
    offlineResult.valid;

  if (allCorrect) {
    console.log(
      "✓ Public keys are discoverable over HTTP with no credential, and a fetched key verifies a real record fully offline.",
    );
  } else {
    console.log("✗ Expected all four scenarios above to pass.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 109 - Durable-Evidence Key Rotation");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
