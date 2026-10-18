import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { CapabilityPolicyBinder } from "@parmana/policy";

import { createPolicyInEffectRouter } from "../../src/routes/policy-in-effect.js";

/**
 * GET /policies/in-effect for a capability registered as an external
 * connector (ADR-0013): the registration names the policy, policy
 * governance its version, and the answer carries what a request under
 * it must carry, as for a built in capability. The registration here
 * binds an existing policy, llm-tool-call, so its signals are real.
 */
function appWith(binder: CapabilityPolicyBinder) {
  const app = express();
  app.use("/policies", createPolicyInEffectRouter(undefined, binder));
  return app;
}

const registered = {
  async policyFor(capability: string) {
    return capability === "erp:create-invoice" ? "llm-tool-call" : undefined;
  },
};

describe("GET /policies/in-effect for an external connector", () => {
  it("answers with the registration's policy at the version governance approved, and its signals", async () => {
    const response = await request(
      appWith(
        new CapabilityPolicyBinder(
          {
            async currentVersion(name) {
              return name === "llm-tool-call" ? "1.1.0" : undefined;
            },
          },
          registered,
        ),
      ),
    )
      .get("/policies/in-effect")
      .query({ capability: "erp:create-invoice" });

    expect(response.status).toBe(200);
    expect(response.body.policy).toEqual({
      name: "llm-tool-call",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    });
    expect(Object.keys(response.body.signals.approval).length).toBeGreaterThan(
      0,
    );
  });

  it("returns 409 when no version of the registration's policy was approved", async () => {
    const response = await request(
      appWith(
        new CapabilityPolicyBinder(
          { currentVersion: async () => undefined },
          registered,
        ),
      ),
    )
      .get("/policies/in-effect")
      .query({ capability: "erp:create-invoice" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("NO_APPROVED_POLICY_VERSION");
  });

  it("returns 503 where policy governance does not decide versions, or the registration cannot be read", async () => {
    for (const binder of [
      new CapabilityPolicyBinder(undefined, registered),
      new CapabilityPolicyBinder(
        { currentVersion: async () => "1.1.0" },
        {
          policyFor: async () => {
            throw new Error("storage unreachable");
          },
        },
      ),
    ]) {
      const response = await request(appWith(binder))
        .get("/policies/in-effect")
        .query({ capability: "erp:create-invoice" });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("POLICY_VERSION_UNAVAILABLE");
    }
  });

  it("returns 404 for a capability neither built in nor registered", async () => {
    const response = await request(
      appWith(
        new CapabilityPolicyBinder(
          { currentVersion: async () => "1.1.0" },
          registered,
        ),
      ),
    )
      .get("/policies/in-effect")
      .query({ capability: "erp:void-invoice" });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("CAPABILITY_NOT_BOUND");
  });
});
