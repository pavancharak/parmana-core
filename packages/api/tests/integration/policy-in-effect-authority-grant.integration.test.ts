import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  CapabilityPolicyBinder,
  PolicyAction,
  type Policy,
} from "@parmana/policy";

import { createPolicyInEffectRouter } from "../../src/routes/policy-in-effect.js";

/**
 * GET /policies/in-effect tells an agent when the policy requires a
 * per-agent authority grant (RFC-0023 phase 3), so it knows a request
 * from a key without one is refused, and says nothing otherwise.
 */
function policy(requireAuthorityGrant?: boolean): Policy {
  return {
    policyId: "release-goods",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    ...(requireAuthorityGrant !== undefined && { requireAuthorityGrant }),
    rules: [
      {
        id: "always",
        condition: { always: true },
        outcome: { action: PolicyAction.REJECT, reason: "test" },
      },
    ],
  };
}

function appFor(loaded: Policy) {
  const app = express();
  app.use(
    "/policies",
    createPolicyInEffectRouter(
      undefined,
      new CapabilityPolicyBinder(
        { currentVersion: async () => "1.0.0" },
        { policyFor: async () => "release-goods" },
      ),
      async () => loaded,
    ),
  );
  return app;
}

describe("GET /policies/in-effect: authorityGrantRequired", () => {
  it("is true when the policy requires a grant", async () => {
    const response = await request(appFor(policy(true)))
      .get("/policies/in-effect")
      .query({ capability: "erp:release-goods" });

    expect(response.status).toBe(200);
    expect(response.body.authorityGrantRequired).toBe(true);
  });

  it.each([false, undefined])(
    "is absent when the policy says %s",
    async (value) => {
      const response = await request(appFor(policy(value)))
        .get("/policies/in-effect")
        .query({ capability: "erp:release-goods" });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("authorityGrantRequired");
    },
  );
});
