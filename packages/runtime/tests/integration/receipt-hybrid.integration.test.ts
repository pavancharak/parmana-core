import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  BusinessTransaction,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  Receipt,
  VerificationStatus,
} from "@parmana/shared";
import {
  CryptoBootstrap,
  FileKeyProvider,
  HybridSignatureProvider,
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "@parmana/crypto";

import { ReceiptService } from "../../src/services/receipt-service.js";

/**
 * Hybrid Signature Support milestone, Phase A. Mirrors
 * receipt.integration.test.ts's own fixture style, run under
 * CRYPTO_MODE=hybrid, and independently re-verifies the produced
 * `signatures` (not just asserting they're present) via
 * HybridSignatureProvider -- the same class ReceiptCrypto itself
 * uses to produce them, exercised here from the outside.
 */
describe.skipIf(!isMlDsa65Supported())(
  `Receipt Service (hybrid mode)${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
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

    it("generates a hybrid-signed receipt with two independently-verifiable signatures", async () => {
      const transaction = {
        businessTransactionId: "tx-hybrid-receipt",
      } as BusinessTransaction;

      const trustRecord: ExecutionTrustRecord = {
        trustRecordId: "tr-hybrid-receipt",
        businessTransactionId: transaction.businessTransactionId,
        transaction,
        overrides: [],
        executions: [],
        verifications: [
          {
            verificationId: "v-1",
            businessTransactionId: transaction.businessTransactionId,
            status: VerificationStatus.VERIFIED,
            message: "ok",
            verifiedAt: new Date(),
            trustRecordHash: "hash",
          },
        ],
        receipts: [],
        trustRecordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const receiptService = new ReceiptService({
        findByTransactionId: async () => trustRecord,
        appendReceipt: async () => {},
      } as unknown as ExecutionTrustRecordRepository);

      const receipt: Receipt = await receiptService.generate(
        transaction.businessTransactionId,
      );

      // Legacy fields unchanged in shape/presence.
      expect(receipt.signature).toBeTypeOf("string");
      expect(receipt.algorithm).toBe("ed25519");

      // Additive hybrid fields.
      expect(receipt.schemaVersion).toBe(2);
      expect(receipt.signatures).toHaveLength(2);
      expect(
        receipt.signatures?.map((entry) => entry.algorithm).sort(),
      ).toEqual(["dilithium3", "ed25519"].sort());

      // Independently re-verify via the same class ReceiptCrypto used
      // to produce these -- proves they're real signatures, not just
      // present fields.
      const keys = new FileKeyProvider();
      const provider = new HybridSignatureProvider(
        CryptoBootstrap.createHybrid(),
        keys,
      );

      const {
        signature: _signature,
        algorithm,
        schemaVersion,
        signatures,
        ...unsignedReceipt
      } = receipt;

      expect(
        await provider.verify(
          { ...unsignedReceipt, algorithm, schemaVersion },
          signatures ?? [],
        ),
      ).toBe(true);
    });

    it("rejects when a hybrid receipt's signatures are tampered", async () => {
      const transaction = {
        businessTransactionId: "tx-hybrid-receipt-tampered",
      } as BusinessTransaction;

      const trustRecord: ExecutionTrustRecord = {
        trustRecordId: "tr-hybrid-receipt-tampered",
        businessTransactionId: transaction.businessTransactionId,
        transaction,
        overrides: [],
        executions: [],
        verifications: [
          {
            verificationId: "v-1",
            businessTransactionId: transaction.businessTransactionId,
            status: VerificationStatus.VERIFIED,
            message: "ok",
            verifiedAt: new Date(),
            trustRecordHash: "hash",
          },
        ],
        receipts: [],
        trustRecordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const receiptService = new ReceiptService({
        findByTransactionId: async () => trustRecord,
        appendReceipt: async () => {},
      } as unknown as ExecutionTrustRecordRepository);

      const receipt = await receiptService.generate(
        transaction.businessTransactionId,
      );

      const keys = new FileKeyProvider();
      const provider = new HybridSignatureProvider(
        CryptoBootstrap.createHybrid(),
        keys,
      );

      const {
        signature: _signature,
        algorithm,
        schemaVersion,
        signatures,
        ...unsignedReceipt
      } = receipt;

      const tampered = (signatures ?? []).map((entry) =>
        entry.algorithm === "ed25519"
          ? { ...entry, signature: `${entry.signature.slice(0, -4)}AAAA` }
          : entry,
      );

      expect(
        await provider.verify(
          { ...unsignedReceipt, algorithm, schemaVersion },
          tampered,
        ),
      ).toBe(false);
    });
  },
);
