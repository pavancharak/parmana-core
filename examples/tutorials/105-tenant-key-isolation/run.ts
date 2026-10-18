import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// docs/VERIFICATION-GAPS.md G-32 / docs/CLAIMS.md 2.28: RuntimeAuthorizationSigner
// used to sign every Execution Authorization under the single shared "default"
// key, regardless of tenant. It now resolves a dedicated "tenant.<tenantId>" key
// via TenantKeyResolver when one has been provisioned, falling back to "default"
// otherwise -- this tutorial demonstrates all three residuals documented in G-32:
// isolation when a tenant key exists, silent fallback when it doesn't, and the
// unchanged default-only path when no tenantId is supplied at all.
//
// A scratch key directory is used so this tutorial never touches the repo's own
// keys/ directory -- only "default" and "tenant.acme-corp" are provisioned here;
// "globex-corp" deliberately is not, to demonstrate the fallback.
//
const keyDir = mkdtempSync(join(tmpdir(), "parmana-tutorial-105-keys-"));

function writeKeyPair(keyId: string): void {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(
    join(keyDir, `${keyId}.private.pem`),
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  writeFileSync(
    join(keyDir, `${keyId}.public.pem`),
    publicKey.export({ format: "pem", type: "spki" }),
  );
}

writeKeyPair("default");
writeKeyPair("tenant.acme-corp");
// "tenant.globex-corp" is intentionally NOT provisioned.

process.env.PARMANA_KEY_DIR = keyDir;

const { FilePolicyRepository } = await import("@parmana/policy");
const { RuntimeBuilder } = await import("@parmana/runtime");
const { MemoryExecutionTrustRecordRepository } =
  await import("@parmana/storage");
const { AuthorizationVerifier, CryptoBootstrap, FileKeyProvider } =
  await import("@parmana/crypto");
const path = await import("node:path");

const root = path.resolve(import.meta.dirname);

const policyRepository = new FilePolicyRepository(
  path.resolve(root, "../../../policies"),
);
const trustRecords = new MemoryExecutionTrustRecordRepository();

const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(policyRepository)
  .build(trustRecords);

async function transactionFor(
  businessTransactionId: string,
  tenantId?: string,
) {
  return withDemoApproval({
    businessTransactionId,

    metadata: {
      businessTransactionId,
      ...(tenantId !== undefined && { tenantId }),
    },

    authority: {
      authorityId: "authority-105",
      authorityType: "USER",
      principalId: "tutorial-105",
      issuedAt: new Date(),
    },

    authorization: {
      authorizationId: `${businessTransactionId}-authorization`,
      authorityId: "authority-105",
      purpose: "Tutorial 105",
      issuedAt: new Date(),
    },

    intent: {
      intentId: `${businessTransactionId}-intent`,
      authorizationId: `${businessTransactionId}-authorization`,
      action: "vendor-payment",
      target: "sap.payment.release",
      parameters: {
        invoiceId: "invoice-105",
        vendorId: "vendor-105",
        amount: 5000,
        currency: "USD",
      },
      createdAt: new Date(),
    },

    policy: {
      name: "vendor-payment",
      version: "2.1.0",
      schemaVersion: "1.0.0",
    },

    signals: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 5000,
      riskScore: 10,
      vendorId: "sap.payment.release",
    },

    status: "RECEIVED",

    createdAt: new Date(),
  } as unknown as Parameters<typeof runtime.execute>[0]);
}

console.log();
console.log("==================================================");
console.log("Tutorial 105 - Tenant Key Isolation");
console.log("==================================================");
console.log();

try {
  console.log(
    'Scenario 1: transaction with metadata.tenantId = "acme-corp", a provisioned tenant key exists',
  );
  console.log("--------------------------------------------------");
  const { context: acmeContext } = await runtime.execute(
    await transactionFor("tx-105-acme", "acme-corp"),
  );
  const acmeAuthorization = acmeContext.authorization!;
  console.log(`Signed under keyId : ${acmeAuthorization.keyId}`);
  console.log();

  console.log(
    'Scenario 2: transaction with metadata.tenantId = "globex-corp", NO tenant key provisioned',
  );
  console.log("--------------------------------------------------");
  const { context: globexContext } = await runtime.execute(
    await transactionFor("tx-105-globex", "globex-corp"),
  );
  const globexAuthorization = globexContext.authorization!;
  console.log(
    `Signed under keyId : ${globexAuthorization.keyId} (fell back to the shared default key)`,
  );
  console.log();

  console.log(
    "Scenario 3: transaction with no tenantId at all (metadata carries none)",
  );
  console.log("--------------------------------------------------");
  const { context: noTenantContext } = await runtime.execute(
    await transactionFor("tx-105-no-tenant"),
  );
  const noTenantAuthorization = noTenantContext.authorization!;
  console.log(
    `Signed under keyId : ${noTenantAuthorization.keyId} (unchanged, single-tenant path)`,
  );
  console.log();

  console.log(
    "Isolation check: acme-corp's authorization verifies under its own key, NOT under the shared default key",
  );
  console.log("--------------------------------------------------");
  const crypto = CryptoBootstrap.create();
  const verifier = new AuthorizationVerifier(crypto);
  const keys = new FileKeyProvider();

  const verifiesUnderOwnKey = (
    await verifier.verify(
      acmeAuthorization,
      await keys.getPublicKey("tenant.acme-corp"),
    )
  ).valid;

  const verifiesUnderDefaultKey = (
    await verifier.verify(acmeAuthorization, await keys.getPublicKey("default"))
  ).checks.signatureVerified;

  console.log(
    `Verifies under tenant.acme-corp's public key : ${verifiesUnderOwnKey}`,
  );
  console.log(
    `Verifies under the shared default public key : ${verifiesUnderDefaultKey}`,
  );
  console.log();

  const allPassed =
    acmeAuthorization.keyId === "tenant.acme-corp" &&
    globexAuthorization.keyId === "default" &&
    noTenantAuthorization.keyId === "default" &&
    verifiesUnderOwnKey === true &&
    verifiesUnderDefaultKey === false;

  if (allPassed) {
    console.log(
      "✓ A tenant with a provisioned key signs, and is only verifiable, under that key -- an unprovisioned or absent tenantId both fall back to the shared default key, exactly as G-32 documents.",
    );
  } else {
    console.log(
      "✗ Expected all three scenarios and the isolation check to behave exactly as documented.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 106 - API Key Issuance (Writing a New Policy)");
} finally {
  delete process.env.PARMANA_KEY_DIR;
  rmSync(keyDir, { recursive: true, force: true });
}
