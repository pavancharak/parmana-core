import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import {
  CryptoBootstrap,
  FileKeyProvider,
  SignatureVerifier,
} from "@parmana/crypto";

import app from "../test-app.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

interface ReceiptResponse {
  receiptId: string;
  businessTransactionId: string;
  trustRecordHash: string;
  receiptHash: string;
  issuedAt: string;
  algorithm: string;
  signature: string;
}

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

const databaseConfigured = resolveDatabaseGate("Receipt Signature");

describe.skipIf(!databaseConfigured)("Receipt Signature", () => {
  it("generates a verifiable receipt signature", async () => {
    //
    // Arrange
    //
    const transaction = await createBusinessTransaction();

    //
    // Execute
    //
    const execute = await request(app).post("/execute").send(transaction);

    expect(execute.status).toBe(200);

    const trustRecord = execute.body;

    //
    // Verify
    //
    const verify = await request(app).post("/verify").send({
      businessTransactionId: trustRecord.businessTransactionId,
    });

    expect(verify.status).toBe(200);

    //
    // Generate Receipt
    //
    const receipt = await request(app).post("/receipt").send({
      businessTransactionId: trustRecord.businessTransactionId,
    });

    expect(receipt.status).toBe(200);

    //
    // Verify Receipt Signature
    //
    const cryptoProvider = CryptoBootstrap.create();

    const verifier = new SignatureVerifier(cryptoProvider);

    const keyProvider = new FileKeyProvider();

    const publicKey = await keyProvider.getPublicKey("default");

    const receiptBody = receipt.body as ReceiptResponse;

    const { signature, ...unsignedReceipt } = receiptBody;

    const verified = await verifier.verify(
      unsignedReceipt,
      signature,
      publicKey,
    );

    expect(verified).toBe(true);
  }, 30000);
});
