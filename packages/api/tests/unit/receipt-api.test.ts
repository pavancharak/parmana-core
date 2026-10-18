import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";

describe("POST /receipt", () => {
  it("returns a validation error for an invalid Business Transaction ID", async () => {
    const response = await request(app).post("/receipt").send({
      businessTransactionId: "txn-001",
    });

    expect(response.status).toBe(400);

    expect(response.body.error).toBe(
      "businessTransactionId must be a valid UUID.",
    );
  });
});
