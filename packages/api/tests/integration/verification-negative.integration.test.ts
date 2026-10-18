import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../test-app.js";
import { executionTrustRecordRepository } from "../../src/repositories.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate(
  "Verification Negative Integration",
);

describe.skipIf(!databaseConfigured)(
  "Verification Negative Integration",
  () => {
    it("reports FAILED when the persisted record is tampered after execution", async () => {
      //
      // Execute a real transaction through the live path so a
      // genuinely hashed and signed Execution Trust Record is
      // persisted in storage.
      //
      const transaction = await createBusinessTransaction();

      const execute = await request(app).post("/execute").send(transaction);

      expect(execute.status).toBe(200);

      const originalExecution = execute.body.executions[0];

      //
      // Tamper the stored record via the repository's own
      // public interface: replaceExecution() overwrites the
      // persisted Execution snapshot without touching the
      // trust record's stored trustRecordHash/signature, so
      // the next verification recomputes a hash that no
      // longer matches what was signed. This does not reach
      // into any private/internal storage detail — it is the
      // same ExecutionTrustRecordRepository method the
      // runtime itself calls.
      //
      await executionTrustRecordRepository.replaceExecution({
        ...originalExecution,
        metadata: {
          ...originalExecution.metadata,
          authorizationId: "tampered-authorization-id",
        },
      });

      const verify = await request(app).post("/verify").send({
        businessTransactionId: transaction.businessTransactionId,
      });

      expect(verify.status).toBe(200);
      expect(verify.body.status).toBe("FAILED");
      expect(verify.body.message).toContain("Integrity check failed");
    }, 30000);

    it("fails for an unknown Business Transaction", async () => {
      const response = await request(app)
        .post("/verify")

        .send({
          businessTransactionId: crypto.randomUUID(),
        });

      expect(response.status).toBe(404);

      expect(response.body.error).toContain(
        "Execution Trust Record not found.",
      );
    });

    it("fails when Business Transaction ID is missing", async () => {
      const response = await request(app)
        .post("/verify")

        .send({});

      expect(response.status).toBe(400);
    });

    it("fails for an invalid Business Transaction ID", async () => {
      const response = await request(app)
        .post("/verify")

        .send({
          businessTransactionId: "not-a-uuid",
        });

      expect(response.status).toBe(400);
    });
  },
);
