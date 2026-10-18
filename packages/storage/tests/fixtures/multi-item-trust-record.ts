import crypto from "node:crypto";

import { VerificationCrypto } from "@parmana/crypto";

import {
  AuthorityType,
  BusinessTransactionStatus,
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  SignatureAlgorithms,
  VerificationStatus,
  type BusinessTransaction,
  type Execution,
  type ExecutionTrustRecord,
  type Override,
  type Receipt,
  type SignedExecutionAuthorization,
  type Verification,
} from "@parmana/shared";

/**
 * Builds a BusinessTransaction fixture for the ordering tests.
 */
export function buildBusinessTransaction(
  businessTransactionId: string,
): BusinessTransaction {
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();

  return {
    businessTransactionId,

    metadata: {
      businessTransactionId,
    },

    authority: {
      authorityId,
      authorityType: AuthorityType.USER,
      principalId: "ordering-test",
      displayName: "Ordering Test",
      issuedAt: new Date("2026-07-11T00:00:00Z"),
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: "Ordering Test",
      issuedAt: new Date("2026-07-11T00:00:00Z"),
    },

    intent: {
      intentId,
      authorizationId,
      action: "payments:execute",
      target: "vendor://payments",
      parameters: {},
      createdAt: new Date("2026-07-11T00:00:00Z"),
    },

    policy: {
      name: "vendor-payment",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },

    signals: {},

    status: BusinessTransactionStatus.EXECUTED,

    createdAt: new Date("2026-07-11T00:00:00Z"),
  };
}

function buildExecution(
  businessTransactionId: string,
  label: string,
  startedAt: Date,
): Execution {
  return {
    executionId: crypto.randomUUID(),

    businessTransactionId,

    decision: {
      decisionId: crypto.randomUUID(),
      intentId: crypto.randomUUID(),

      policy: {
        name: "vendor-payment",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      },

      signals: {},

      outcome: DecisionOutcome.APPROVED,

      reason: label,

      evaluatedAt: startedAt,
    },

    status: ExecutionStatus.COMPLETED,

    mode: ExecutionMode.SYNC,

    startedAt,

    completedAt: startedAt,
  };
}

function buildOverride(
  businessTransactionId: string,
  label: string,
  approvedAt: Date,
): Override {
  return {
    overrideId: crypto.randomUUID(),

    businessTransactionId,

    approvedBy: "ordering-test",

    reason: label,

    approvedAt,
  };
}

function buildVerification(
  businessTransactionId: string,
  trustRecordHash: string,
  verifiedAt: Date,
): Verification {
  return {
    verificationId: crypto.randomUUID(),

    businessTransactionId,

    status: VerificationStatus.VERIFIED,

    verifiedAt,

    trustRecordHash,
  };
}

function buildReceipt(
  businessTransactionId: string,
  trustRecordHash: string,
  issuedAt: Date,
): Receipt {
  return {
    receiptId: crypto.randomUUID(),

    businessTransactionId,

    trustRecordHash,

    receiptHash: crypto.randomUUID(),

    signature: "test-signature",

    algorithm: "Ed25519",

    issuedAt,
  };
}

/**
 * Builds a hashed and signed ExecutionTrustRecord with two Executions and
 * two Overrides already present at signing time (the only two collections
 * that feed VerificationCrypto's canonical hash — see
 * VerificationCrypto.canonicalRecord()). Appending a second Execution or
 * Override to an already-sealed record breaks its hash (it is never
 * re-sealed), so both items must exist before hashing/signing rather
 * than being appended afterward.
 */
export async function buildSignedMultiExecutionOverrideRecord(
  transaction: BusinessTransaction,
  authorization?: SignedExecutionAuthorization,
): Promise<ExecutionTrustRecord> {
  const businessTransactionId = transaction.businessTransactionId;

  const executions = [
    buildExecution(
      businessTransactionId,
      "execution-1",
      new Date("2026-07-11T00:00:01Z"),
    ),
    buildExecution(
      businessTransactionId,
      "execution-2",
      new Date("2026-07-11T00:00:02Z"),
    ),
  ];

  const overrides = [
    buildOverride(
      businessTransactionId,
      "override-1",
      new Date("2026-07-11T00:00:03Z"),
    ),
    buildOverride(
      businessTransactionId,
      "override-2",
      new Date("2026-07-11T00:00:04Z"),
    ),
  ];

  const now = new Date("2026-07-11T00:00:05Z");

  const draft = {
    trustRecordId: crypto.randomUUID(),

    businessTransactionId,

    transaction,

    ...(authorization !== undefined ? { authorization } : {}),

    overrides,

    executions,

    verifications: [],

    receipts: [],

    createdAt: now,

    updatedAt: now,
  };

  const verificationCrypto = new VerificationCrypto();

  const trustRecordWithEmptyHash: ExecutionTrustRecord = {
    ...draft,

    trustRecordHash: "",

    signature: {
      algorithm: SignatureAlgorithms.ED25519,
      keyId: "default",
      value: "",
      signedAt: now,
    },
  };

  const trustRecordHash = await verificationCrypto.hash(
    trustRecordWithEmptyHash,
  );

  const recordWithHash: ExecutionTrustRecord = {
    ...trustRecordWithEmptyHash,

    trustRecordHash,
  };

  const signature = await verificationCrypto.sign(recordWithHash);

  return {
    ...recordWithHash,

    signature,
  };
}

/**
 * Two Verifications to append post-seal. Verifications sit outside the
 * canonical hash (VerificationCrypto.canonicalRecord() excludes them), so
 * appending them after create() is safe and does not invalidate the
 * signature.
 */
export function buildVerificationPair(
  businessTransactionId: string,
  trustRecordHash: string,
): readonly [Verification, Verification] {
  return [
    buildVerification(
      businessTransactionId,
      trustRecordHash,
      new Date("2026-07-11T00:00:06Z"),
    ),
    buildVerification(
      businessTransactionId,
      trustRecordHash,
      new Date("2026-07-11T00:00:07Z"),
    ),
  ];
}

/**
 * Two Receipts to append post-seal. Same rationale as
 * buildVerificationPair() — receipts are excluded from the canonical hash.
 */
export function buildReceiptPair(
  businessTransactionId: string,
  trustRecordHash: string,
): readonly [Receipt, Receipt] {
  return [
    buildReceipt(
      businessTransactionId,
      trustRecordHash,
      new Date("2026-07-11T00:00:08Z"),
    ),
    buildReceipt(
      businessTransactionId,
      trustRecordHash,
      new Date("2026-07-11T00:00:09Z"),
    ),
  ];
}
