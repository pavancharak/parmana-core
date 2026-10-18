import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";

/**
 * Found by adversarial testing: malformed JSON and oversized request
 * bodies both fell through express.json()'s error into the generic
 * 500 branch of errorHandler, indistinguishable from a server crash,
 * even though the webhook route (routes/webhooks-razorpay.ts) already
 * had dedicated handling for the identical "entity.too.large" error
 * type. Every case still failed closed (nothing executed) — this is
 * a response-clarity fix, not a security bypass fix.
 */
describe("Malformed / oversized request body handling", () => {
  it("returns 400, not 500, for malformed JSON", async () => {
    const response = await request(app)
      .post("/execute")
      .set("Content-Type", "application/json")
      .send('{"businessTransactionId": "not-closed');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Malformed JSON body.");
  });

  it("returns 413, not 500, for a request body over express.json()'s size limit", async () => {
    const oversizedPayload = JSON.stringify({
      businessTransactionId: "00000000-0000-4000-8000-000000000000",
      padding: "A".repeat(200 * 1024),
    });

    const response = await request(app)
      .post("/execute")
      .set("Content-Type", "application/json")
      .send(oversizedPayload);

    expect(response.status).toBe(413);
    expect(response.body.error).toBe("Payload too large.");
  });
});
