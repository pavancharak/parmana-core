import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  VerificationStatus,
  type BusinessTransaction,
  type Execution,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
  type Verification,
} from "@parmana/shared";
import { isMlDsa65Supported, ML_DSA_65_SKIP_REASON } from "@parmana/crypto";

import { BusinessTrustRecordBuilder } from "../../src/BusinessTrustRecordBuilder.js";
import { VerificationService } from "../../src/services/verification-service.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

/**
 * Hybrid Signature Support milestone, Phase A.
 *
 * Exercises the real, wired-together path -- BusinessTrustRecordBuilder
 * -> VerificationCrypto.signHybrid() -> VerificationService ->
 * VerificationCrypto.verifySignature() -- rather than unit-testing
 * VerificationCrypto in isolation, mirroring verification-service.test.ts's
 * own "live path" convention. CRYPTO_MODE=hybrid and
 * SECONDARY_SIGNATURE_PROVIDER=dilithium3 are set once here, for this
 * file's isolated module registry only (vitest's default per-file
 * isolation), and a default-secondary ML-DSA-65 keypair is written
 * alongside the "default" Ed25519 keypair vitest.setup.ts already
 * provisions in PARMANA_KEY_DIR.
 */
class InMemoryExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  private readonly store = new Map<string, ExecutionTrustRecord>();

  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    this.store.set(record.businessTransactionId, record);
    return record;
  }

  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord | null> {
    return this.store.get(businessTransactionId) ?? null;
  }

  async appendExecution(): Promise<void> {}
  async replaceExecution(): Promise<void> {}
  async appendOverride(): Promise<void> {}
  async appendVerification(
    _businessTransactionId: string,
    _verification: Verification,
  ): Promise<void> {}
  async appendReceipt(): Promise<void> {}
}

function createTransaction(businessTransactionId: string): BusinessTransaction {
  const authorityId = "authority-1";
  const authorizationId = "authorization-1";
  const fixedDate = new Date("2026-01-01T00:00:00Z");

  return {
    businessTransactionId,

    metadata: {
      businessTransactionId,
    },

    authority: {
      authorityId,
      authorityType: AuthorityType.SERVICE,
      principalId: "svc-1",
      issuedAt: fixedDate,
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: "test",
      issuedAt: fixedDate,
    },

    intent: {
      intentId: "intent-1",
      authorizationId,
      action: "PAY",
      target: "vendor/1",
      parameters: { amount: 100 },
      createdAt: fixedDate,
    },

    policy: {
      name: "payment-approval",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },

    signals: { amount: 100 },

    status: BusinessTransactionStatus.RECEIVED,

    createdAt: fixedDate,
  };
}

async function buildTrustRecord(
  businessTransactionId: string,
): Promise<ExecutionTrustRecord> {
  const transaction = createTransaction(businessTransactionId);
  const fixedDate = new Date("2026-01-01T00:00:00Z");

  const execution: Execution = {
    executionId: `exec-${businessTransactionId}`,
    businessTransactionId,

    decision: {
      decisionId: `decision-${businessTransactionId}`,
      intentId: "intent-1",
      policy: transaction.policy,
      signals: transaction.signals as Record<string, never>,
      outcome: DecisionOutcome.APPROVED,
      evaluatedAt: fixedDate,
    },

    status: ExecutionStatus.COMPLETED,
    mode: ExecutionMode.SYNC,
    startedAt: fixedDate,
    completedAt: fixedDate,

    metadata: { authorizationId: "authorization-xyz" },
  };

  const context: RuntimeContext = {
    transaction,
    decision: execution.decision,
    execution,
  };

  return new BusinessTrustRecordBuilder().build(context);
}

describe.skipIf(!isMlDsa65Supported())(
  `VerificationService (hybrid mode)${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    beforeAll(() => {
      process.env.CRYPTO_MODE = "hybrid";
      process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";

      const keyDir = process.env.PARMANA_KEY_DIR;

      if (!keyDir) {
        throw new Error(
          "PARMANA_KEY_DIR was not set by vitest.setup.ts as expected.",
        );
      }

      const secondaryPrivatePath = join(
        keyDir,
        "default-secondary.private.pem",
      );
      const secondaryPublicPath = join(keyDir, "default-secondary.public.pem");

      if (!existsSync(secondaryPrivatePath)) {
        const { privateKey, publicKey } = generateKeyPairSync("ml-dsa-65");

        writeFileSync(
          secondaryPrivatePath,
          privateKey.export({ format: "pem", type: "pkcs8" }),
        );

        writeFileSync(
          secondaryPublicPath,
          publicKey.export({ format: "pem", type: "spki" }),
        );
      }
    });

    it("builds and verifies a hybrid-signed record end to end", async () => {
      const trustRecord = await buildTrustRecord("txn-hybrid-valid");

      expect(trustRecord.schemaVersion).toBe(2);
      expect(trustRecord.signatures).toHaveLength(2);
      expect(
        trustRecord.signatures?.map((entry) => entry.algorithm).sort(),
      ).toEqual(["dilithium3", "ed25519"].sort());

      const repository = new InMemoryExecutionTrustRecordRepository();
      await repository.create(trustRecord);

      const verification = await new VerificationService(repository).verify(
        "txn-hybrid-valid",
      );

      expect(verification.status).toBe(VerificationStatus.VERIFIED);
    });

    it("still verifies a legacy-shaped record (no schemaVersion/signatures) even while this process runs CRYPTO_MODE=hybrid -- additive, not breaking", async () => {
      const hybridRecord = await buildTrustRecord("txn-legacy-shaped");

      // Simulate a record persisted before this milestone: strip the
      // new fields, keep only the always-present legacy `signature`.
      const {
        schemaVersion: _schemaVersion,
        signatures: _signatures,
        ...legacyRecord
      } = hybridRecord;

      const repository = new InMemoryExecutionTrustRecordRepository();
      await repository.create(legacyRecord as ExecutionTrustRecord);

      const verification = await new VerificationService(repository).verify(
        "txn-legacy-shaped",
      );

      expect(verification.status).toBe(VerificationStatus.VERIFIED);
    });

    it("rejects a hybrid record with a corrupted secondary signature -- not a silent downgrade to the legacy signature alone (proven to fail without the fix)", async () => {
      const trustRecord = await buildTrustRecord("txn-hybrid-corrupted");

      const corrupted: ExecutionTrustRecord = {
        ...trustRecord,
        signatures: trustRecord.signatures?.map((entry) =>
          entry.algorithm === "dilithium3"
            ? { ...entry, signature: `${entry.signature.slice(0, -4)}AAAA` }
            : entry,
        ),
      };

      const repository = new InMemoryExecutionTrustRecordRepository();
      await repository.create(corrupted);

      const verification = await new VerificationService(repository).verify(
        "txn-hybrid-corrupted",
      );

      expect(verification.status).toBe(VerificationStatus.FAILED);
      expect(verification.message).toContain("Signature check failed");
    });

    it("rejects a hybrid record with the secondary signature stripped entirely", async () => {
      const trustRecord = await buildTrustRecord("txn-hybrid-stripped");

      const stripped: ExecutionTrustRecord = {
        ...trustRecord,
        signatures: trustRecord.signatures?.filter(
          (entry) => entry.algorithm === "ed25519",
        ),
      };

      expect(stripped.signatures).toHaveLength(1);

      const repository = new InMemoryExecutionTrustRecordRepository();
      await repository.create(stripped);

      const verification = await new VerificationService(repository).verify(
        "txn-hybrid-stripped",
      );

      expect(verification.status).toBe(VerificationStatus.FAILED);
      expect(verification.message).toContain("Signature check failed");
    });

    describe("HYBRID_SIGNATURE_REQUIRED=true (PQC audit RED-4)", () => {
      it("rejects a record with the entire signatures array stripped -- the downgrade the default policy above does not catch", async () => {
        const trustRecord = await buildTrustRecord("txn-hybrid-fully-stripped");

        // Same tampering as "still verifies a legacy-shaped record" above:
        // both schemaVersion and signatures removed entirely, leaving only
        // the always-present legacy signature. That test proves this is
        // ACCEPTED under the default (off) policy -- additive, not
        // breaking. This test proves a deployment that opts in via
        // HYBRID_SIGNATURE_REQUIRED correctly REJECTS the identical input.
        const {
          schemaVersion: _schemaVersion,
          signatures: _signatures,
          ...fullyStripped
        } = trustRecord;

        const repository = new InMemoryExecutionTrustRecordRepository();
        await repository.create(fullyStripped as ExecutionTrustRecord);

        process.env.HYBRID_SIGNATURE_REQUIRED = "true";

        try {
          const verification = await new VerificationService(repository).verify(
            "txn-hybrid-fully-stripped",
          );

          expect(verification.status).toBe(VerificationStatus.FAILED);
          expect(verification.message).toContain("Signature check failed");
        } finally {
          delete process.env.HYBRID_SIGNATURE_REQUIRED;
        }
      });

      it("still verifies a genuinely complete hybrid record", async () => {
        const trustRecord = await buildTrustRecord("txn-hybrid-required-valid");

        const repository = new InMemoryExecutionTrustRecordRepository();
        await repository.create(trustRecord);

        process.env.HYBRID_SIGNATURE_REQUIRED = "true";

        try {
          const verification = await new VerificationService(repository).verify(
            "txn-hybrid-required-valid",
          );

          expect(verification.status).toBe(VerificationStatus.VERIFIED);
        } finally {
          delete process.env.HYBRID_SIGNATURE_REQUIRED;
        }
      });
    });
  },
);
