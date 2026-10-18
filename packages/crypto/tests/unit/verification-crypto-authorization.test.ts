import crypto from "node:crypto";

import { describe, it, expect } from "vitest";

import { VerificationCrypto } from "../../src/index.js";

import {
  AuthorityType,
  BusinessTransactionStatus,
  SignatureAlgorithms,
  type BusinessTransaction,
  type ExecutionTrustRecord,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

/**
 * NF-003: ExecutionTrustRecord.authorization should be covered by the
 * same canonical hash/signature as transaction/overrides/executions,
 * without breaking verification of records built before this field
 * existed. See VerificationCrypto.canonicalRecord()'s own doc comment
 * for why an absent authorization produces byte-identical canonical
 * output to before this field was added.
 */

function buildTransaction(): BusinessTransaction {
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const businessTransactionId = crypto.randomUUID();

  return {
    businessTransactionId,
    metadata: { businessTransactionId },
    authority: {
      authorityId,
      authorityType: AuthorityType.USER,
      principalId: "verification-crypto-authorization-test",
      displayName: "Test",
      issuedAt: new Date("2026-09-07T00:00:00Z"),
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "test",
      issuedAt: new Date("2026-09-07T00:00:00Z"),
    },
    intent: {
      intentId,
      authorizationId,
      action: "hubspot:deal-update",
      target: "deals/1",
      parameters: {},
      createdAt: new Date("2026-09-07T00:00:00Z"),
    },
    policy: {
      name: "hubspot-deal-update",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: {},
    status: BusinessTransactionStatus.EXECUTED,
    createdAt: new Date("2026-09-07T00:00:00Z"),
  };
}

function buildSignedExecutionAuthorization(): SignedExecutionAuthorization {
  return {
    payload: {
      version: 1,
      authorizationId: crypto.randomUUID(),
      nonce: crypto.randomUUID(),
      decisionId: crypto.randomUUID(),
      businessTransactionId: crypto.randomUUID(),
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      authorizedAt: "2026-09-07T00:00:00.000Z",
      expiresAt: "2026-09-07T00:05:00.000Z",
      businessTransactionHash: "test-content-hash",
    },
    signature: "test-authorization-signature",
    keyId: "default",
    algorithm: SignatureAlgorithms.ED25519,
  };
}

async function buildAndSealDraft(
  transaction: BusinessTransaction,
  authorization: SignedExecutionAuthorization | undefined,
  trustRecordId: string = crypto.randomUUID(),
): Promise<ExecutionTrustRecord> {
  const now = new Date("2026-09-07T00:00:05Z");

  const draft = {
    trustRecordId,
    businessTransactionId: transaction.businessTransactionId,
    transaction,
    ...(authorization !== undefined ? { authorization } : {}),
    overrides: [],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt: now,
    updatedAt: now,
  };

  const verificationCrypto = new VerificationCrypto();

  const withEmptyHash: ExecutionTrustRecord = {
    ...draft,
    trustRecordHash: "",
    signature: {
      algorithm: SignatureAlgorithms.ED25519,
      keyId: "default",
      value: "",
      signedAt: now,
    },
  };

  const trustRecordHash = await verificationCrypto.hash(withEmptyHash);
  const recordWithHash: ExecutionTrustRecord = {
    ...withEmptyHash,
    trustRecordHash,
  };
  const signature = await verificationCrypto.sign(recordWithHash);

  return { ...recordWithHash, signature };
}

describe("VerificationCrypto — authorization envelope coverage (NF-003)", () => {
  it("verifies a record with no authorization (pre-existing shape, unaffected)", async () => {
    const verificationCrypto = new VerificationCrypto();
    const record = await buildAndSealDraft(buildTransaction(), undefined);

    await expect(verificationCrypto.verify(record)).resolves.toBe(true);
  });

  it("verifies a record with an authorization present, and its hash differs from the same record without one", async () => {
    const verificationCrypto = new VerificationCrypto();
    const transaction = buildTransaction();
    const trustRecordId = crypto.randomUUID();

    const withoutAuth = await buildAndSealDraft(
      transaction,
      undefined,
      trustRecordId,
    );
    const withAuth = await buildAndSealDraft(
      transaction,
      buildSignedExecutionAuthorization(),
      trustRecordId,
    );

    await expect(verificationCrypto.verify(withAuth)).resolves.toBe(true);

    // Same transaction/overrides/executions/createdAt in both -- the only
    // difference is the presence of `authorization`, so a differing hash
    // proves it is actually part of the canonical, signed payload.
    expect(withAuth.trustRecordHash).not.toBe(withoutAuth.trustRecordHash);
  });

  it("(fail-closed) rejects a record whose stored authorization was tampered with after signing", async () => {
    const verificationCrypto = new VerificationCrypto();
    const record = await buildAndSealDraft(
      buildTransaction(),
      buildSignedExecutionAuthorization(),
    );

    const tampered: ExecutionTrustRecord = {
      ...record,
      authorization: {
        ...record.authorization!,
        signature: "forged-signature",
      },
    };

    await expect(verificationCrypto.verify(tampered)).resolves.toBe(false);
  });

  it("backward compatible: a record built exactly like before this field existed (no `authorization` key at all) still verifies", async () => {
    const verificationCrypto = new VerificationCrypto();
    const transaction = buildTransaction();
    const now = new Date("2026-09-07T00:00:05Z");
    const trustRecordId = crypto.randomUUID();

    // Deliberately the exact pre-fix draft shape -- no `authorization`
    // key present at all, not merely `undefined` -- to prove nothing
    // about this reconstructs differently for genuinely legacy data.
    const legacyDraft = {
      trustRecordId,
      businessTransactionId: transaction.businessTransactionId,
      transaction,
      overrides: [],
      executions: [],
      verifications: [],
      receipts: [],
      createdAt: now,
      updatedAt: now,
    };

    const withEmptyHash: ExecutionTrustRecord = {
      ...legacyDraft,
      trustRecordHash: "",
      signature: {
        algorithm: SignatureAlgorithms.ED25519,
        keyId: "default",
        value: "",
        signedAt: now,
      },
    };

    const trustRecordHash = await verificationCrypto.hash(withEmptyHash);
    const recordWithHash: ExecutionTrustRecord = {
      ...withEmptyHash,
      trustRecordHash,
    };
    const signature = await verificationCrypto.sign(recordWithHash);
    const legacyRecord: ExecutionTrustRecord = { ...recordWithHash, signature };

    await expect(verificationCrypto.verify(legacyRecord)).resolves.toBe(true);

    // And it must equal the hash of the same content built through the
    // helper with `authorization: undefined` explicitly omitted, proving
    // the two shapes are byte-identical to the hasher.
    const equivalent = await buildAndSealDraft(
      transaction,
      undefined,
      trustRecordId,
    );
    expect(legacyRecord.trustRecordHash).toBe(equivalent.trustRecordHash);
  });
});
