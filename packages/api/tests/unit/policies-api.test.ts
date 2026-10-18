import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";

/**
 * POST /policies/validate had zero test coverage before this file —
 * confirmed by the negative-space audit. It does not validate a policy
 * document; it only checks that a policy with the given name+version is
 * loadable from disk (policyRepository.load), see packages/api/src/routes/policies.ts.
 */
describe("POST /policies/validate", () => {
  it("returns 400 when policyId is missing", async () => {
    const response = await request(app)
      .post("/policies/validate")
      .send({ policyVersion: "2.0.0" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      valid: false,
      errors: ["policyId is required."],
    });
  });

  it("returns 400 when policyVersion is missing", async () => {
    const response = await request(app)
      .post("/policies/validate")
      .send({ policyId: "vendor-payment" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      valid: false,
      errors: ["policyVersion is required."],
    });
  });

  it("returns 200 with valid: true when the policy is loadable", async () => {
    const response = await request(app)
      .post("/policies/validate")
      .send({ policyId: "vendor-payment", policyVersion: "2.0.0" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: true, errors: [] });
  });

  it("returns 404 with valid: false when the policy does not exist", async () => {
    const response = await request(app)
      .post("/policies/validate")
      .send({ policyId: "does-not-exist", policyVersion: "9.9.9" });

    expect(response.status).toBe(404);
    expect(response.body.valid).toBe(false);
    expect(response.body.errors[0]).toContain("does-not-exist");
    expect(response.body.errors[0]).toContain("9.9.9");
  });
});
