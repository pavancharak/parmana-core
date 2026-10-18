import { generateKeyPairSync } from "node:crypto";

import {
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import { ArtifactSigner, CryptoBootstrap } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ApprovalPayload, SignedApproval } from "@parmana/shared";

//
// Tutorial 72 exercises ApprovalVerifier wired through the
// HubSpot-specific pipeline (HubSpotSignalStateVerifier). This
// tutorial exercises ApprovalVerifier itself, generically, connector-
// agnostic -- the deterministic verification algorithm frozen in
// the Phase 3A approval artifact design (in git history), with
// its full per-check breakdown (`result.checks`), independent
// verifier instances, and durable cross-process replay protection. A
// regression that breaks the shared component for a non-HubSpot shape
// could pass Tutorial 72 while failing here.
//
const crypto = CryptoBootstrap.create();

async function signPayload(
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

function buildPayload(
  overrides: Partial<ApprovalPayload> = {},
): ApprovalPayload {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    version: 1,
    approvalId: "approval-1",
    issuer: { approverId: "manager-jane", keyId: "manager-jane-key-1" },
    issuedAt: now.toISOString(),
    expiresAt: later.toISOString(),
    capability: "hubspot:deal-update",
    resourceId: "9005",
    scope: { field: "amountDeltaAbs", comparator: "lte", value: 50_000 },
    nonce: `nonce-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

console.log();
console.log("==================================================");
console.log("Tutorial 95 - Generic Approval Verifier");
console.log("==================================================");
console.log();

const results: { name: string; passed: boolean }[] = [];
function check(name: string, passed: boolean): void {
  results.push({ name, passed });
  console.log(`  ${passed ? "✓" : "✗"} ${name}`);
}

console.log(
  "Baseline: a well-formed artifact from a trusted, unrevoked issuer, within scope",
);
console.log("--------------------------------------------------");
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const result = await verifier.verify(
    artifact,
    {
      action: "hubspot:deal-update",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    new Date(),
  );
  console.log(`  result.checks: ${JSON.stringify(result.checks)}`);
  check(
    "every individual check passes for a genuine artifact",
    result.valid === true &&
      Object.values(result.checks).every((c) => c === true),
  );
}
console.log();

console.log("Malformed / trust / signature failures");
console.log("--------------------------------------------------");
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(
    buildPayload({ version: 2 as unknown as 1 }),
    privateKey,
  );
  const result = await verifier.verify(artifact, {
    action: "hubspot:deal-update",
    resourceId: "9005",
    requestedValue: 40_000,
  });
  check(
    "unsupported payload version fails versionSupported, before any other check",
    result.valid === false && result.checks.versionSupported === false,
  );
}
{
  const { privateKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const result = await verifier.verify(artifact, {
    action: "hubspot:deal-update",
    resourceId: "9005",
    requestedValue: 40_000,
  });
  check(
    "an artifact from an unregistered (approverId, keyId) fails issuerKnown",
    result.valid === false && result.checks.issuerKnown === false,
  );
}
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: true,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const result = await verifier.verify(
    artifact,
    {
      action: "hubspot:deal-update",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    new Date(),
  );
  check(
    "a revoked issuer fails notRevoked, even though the signature itself is genuinely valid (distinct, independent check)",
    result.valid === false &&
      result.checks.notRevoked === false &&
      result.checks.signatureVerified === true,
  );
}
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const tampered: SignedApproval = {
    ...artifact,
    payload: {
      ...artifact.payload,
      scope: { ...artifact.payload.scope, value: 999_999_999 },
    },
  };
  const result = await verifier.verify(
    tampered,
    {
      action: "hubspot:deal-update",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    new Date(),
  );
  check(
    "a payload modified after signing fails signatureVerified",
    result.valid === false && result.checks.signatureVerified === false,
  );
}
{
  const legitimate = generateKeyPairSync("ed25519");
  const forger = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey: legitimate.publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const forged = await signPayload(buildPayload(), forger.privateKey);
  const result = await verifier.verify(
    forged,
    {
      action: "hubspot:deal-update",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    new Date(),
  );
  check(
    "a forged signature (claims a registered identity, wrong key) fails signatureVerified",
    result.valid === false && result.checks.signatureVerified === false,
  );
}
console.log();

console.log("Scope, expiry, and identity-binding failures");
console.log("--------------------------------------------------");
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const now = new Date();
  const artifact = await signPayload(
    buildPayload({
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 1000).toISOString(),
    }),
    privateKey,
  );
  const result = await verifier.verify(
    artifact,
    {
      action: "hubspot:deal-update",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    new Date(now.getTime() + 3_600_000),
  );
  check(
    "an artifact presented after its expiresAt fails notExpired",
    result.valid === false && result.checks.notExpired === false,
  );
}
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const result = await verifier.verify(
    artifact,
    {
      action: "razorpay:refund-create",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    new Date(),
  );
  check(
    "presenting the artifact for a different capability than it was issued for fails capabilityMatches",
    result.valid === false && result.checks.capabilityMatches === false,
  );
}
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const result = await verifier.verify(
    artifact,
    {
      action: "hubspot:deal-update",
      resourceId: "SOME-OTHER-DEAL",
      requestedValue: 40_000,
    },
    new Date(),
  );
  check(
    "presenting the artifact for a different business object fails resourceMatches",
    result.valid === false && result.checks.resourceMatches === false,
  );
}
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(
    buildPayload({
      scope: {
        field: "amountDeltaAbs",
        comparator: "between",
        value: { min: 10_000, max: 60_000 },
      },
    }),
    privateKey,
  );
  const result = await verifier.verify(
    artifact,
    {
      action: "hubspot:deal-update",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    new Date(),
  );
  check(
    'a "between" range-bound scope is supported, not just "lte"',
    result.checks.scopeSatisfied === true,
  );
}
console.log();

console.log(
  "Replay protection (single-process, unrelated-rejection, and cross-process)",
);
console.log("--------------------------------------------------");
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const request = {
    action: "hubspot:deal-update",
    resourceId: "9005",
    requestedValue: 40_000,
  };
  const now = new Date();
  const first = await verifier.verify(artifact, request, now);
  const second = await verifier.verify(artifact, request, now);
  check(
    "a second presentation of the same artifact fails nonceUnseen",
    first.valid === true &&
      second.valid === false &&
      second.checks.nonceUnseen === false,
  );
}
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const verifier = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: new MemoryNonceStore(),
  });
  const artifact = await signPayload(buildPayload(), privateKey);
  const now = new Date();
  const rejected = await verifier.verify(
    artifact,
    {
      action: "hubspot:deal-update",
      resourceId: "WRONG-DEAL",
      requestedValue: 40_000,
    },
    now,
  );
  const corrected = await verifier.verify(
    artifact,
    {
      action: "hubspot:deal-update",
      resourceId: "9005",
      requestedValue: 40_000,
    },
    now,
  );
  check(
    "a rejection on an unrelated ground never burns the nonce -- a corrected retry still succeeds",
    rejected.valid === false && corrected.valid === true,
  );
}
{
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registry = new StaticApprovalIssuerRegistry([
    {
      approverId: "manager-jane",
      keyId: "manager-jane-key-1",
      publicKey,
      revoked: false,
    },
  ]);
  const sharedNonceStore = new MemoryNonceStore();
  const artifact = await signPayload(buildPayload(), privateKey);
  const request = {
    action: "hubspot:deal-update",
    resourceId: "9005",
    requestedValue: 40_000,
  };
  const now = new Date();
  const verifierProcessA = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: sharedNonceStore,
  });
  const verifierProcessB = new ApprovalVerifier({
    crypto,
    issuerRegistry: registry,
    nonceStore: sharedNonceStore,
  });
  const first = await verifierProcessA.verify(artifact, request, now);
  const second = await verifierProcessB.verify(artifact, request, now);
  check(
    "replay protection holds across independent verifier instances sharing one durable nonce store (simulates two processes)",
    first.valid === true && second.valid === false,
  );
}
console.log();

const allPassed = results.every((r) => r.passed);
if (allPassed) {
  console.log(
    "✓ Every generic ApprovalVerifier property held -- version, trust, signature, scope, expiry, identity binding, and replay protection.",
  );
} else {
  console.log(
    `✗ ${results.filter((r) => !r.passed).length} of ${results.length} checks failed.`,
  );
}

console.log();
console.log("Tutorial Complete");
console.log(
  "All 95 tutorials available. Run `npm run examples` to execute the full suite.",
);
