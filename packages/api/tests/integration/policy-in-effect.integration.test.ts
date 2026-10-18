import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_CAPABILITY_POLICY_BINDINGS,
  CapabilityPolicyBinder,
} from "@parmana/policy";
import { AuthorityType } from "@parmana/shared";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { createPolicyInEffectRouter } from "../../src/routes/policy-in-effect.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * GET /policies/in-effect: an agent asks which policy its requests must
 * declare instead of writing a version into its code (G-66 follow up).
 */
describe("GET /policies/in-effect", () => {
  const AGENT_KEY = "policy-in-effect-refund-agent-raw-key-for-tests-only";
  const OTHER_AGENT_KEY = "policy-in-effect-slack-agent-raw-key-for-tests-only";
  const HUMAN_KEY = "policy-in-effect-human-raw-key-for-tests-only";
  const WILDCARD_KEY = "policy-in-effect-wildcard-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "refund-agent",
        keyHash: hashApiKey(AGENT_KEY),
        allowedCapabilities: ["paytm:refund"],
      },
      {
        callerId: "slack-agent",
        keyHash: hashApiKey(OTHER_AGENT_KEY),
        allowedCapabilities: ["slack:post-message"],
      },
      {
        callerId: "operator",
        keyHash: hashApiKey(HUMAN_KEY),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "wildcard",
        keyHash: hashApiKey(WILDCARD_KEY),
        allowedCapabilities: ["*"],
      },
    ]);
    const callerAuditSink = new InMemoryCallerAuditSink();
    const app = createApp(createApplication(executionSystem), {
      callerAuth: { authenticator, auditSink: callerAuditSink },
    });

    return { app, callerAuditSink };
  }

  it("tells a refund agent the policy to declare for paytm:refund", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .query({ capability: "paytm:refund" })
      .set("Authorization", `Bearer ${AGENT_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      capability: "paytm:refund",
      // Under NODE_ENV test governance does not decide the version, so it
      // is the binding in code; production answers with the approved one.
      policy: CANONICAL_CAPABILITY_POLICY_BINDINGS.get("paytm:refund"),
      description: expect.stringContaining("signed manager approval"),
      signals: {
        facts: [
          "fraudCheckPassed",
          "managerApproved",
          "refundAmount",
          "refundEligible",
        ],
        schema: {
          refundEligible: "boolean",
          managerApproved: "boolean",
          fraudCheckPassed: "boolean",
          refundAmount: "number",
        },
        bound: { refundAmount: "parameters.amount" },
        approval: {
          managerApproved: {
            resourceId: "parameters.orderId",
            value: "parameters.amount",
          },
        },
      },
    });
  });

  it("returns what a request must carry, never the rules", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .query({ capability: "paytm:refund" })
      .set("Authorization", `Bearer ${AGENT_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body.rules).toBeUndefined();
    // No rule condition leaves the server; the description is the
    // policy author's own text for people and may mention limits.
    expect(JSON.stringify(response.body.signals)).not.toMatch(
      /"(condition|operator|outcome|rules)"/,
    );
  });

  it("names the approval signal for a read, whose approval covers the pull request", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .query({ capability: "github:pr-fetch" })
      .set("Authorization", `Bearer ${HUMAN_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body.signals.facts).toEqual(["readApproved"]);
    expect(response.body.signals.approval).toEqual({
      readApproved: { resourceId: "target" },
    });
  });

  it("refuses a request with no key", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .query({ capability: "paytm:refund" });

    expect(response.status).toBe(401);
  });

  it("refuses an agent whose key may not invoke the capability, and audits it", async () => {
    const { app, callerAuditSink } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .query({ capability: "paytm:refund" })
      .set("Authorization", `Bearer ${OTHER_AGENT_KEY}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CAPABILITY_NOT_ALLOWED");
    expect(
      callerAuditSink.events.some(
        (event) =>
          event.type === "caller.capability_denied" &&
          event.callerId === "slack-agent" &&
          event.capability === "paytm:refund",
      ),
    ).toBe(true);
  });

  it("answers a human caller, who holds no capabilities", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .query({ capability: "paytm:refund" })
      .set("Authorization", `Bearer ${HUMAN_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body.policy.name).toBe("customer-refund");
  });

  it("requires the capability", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .set("Authorization", `Bearer ${AGENT_KEY}`);

    expect(response.status).toBe(400);
  });

  it("says when no policy is bound to the capability", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get("/policies/in-effect")
      .query({ capability: "test:fixture-execute" })
      .set("Authorization", `Bearer ${WILDCARD_KEY}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("CAPABILITY_NOT_BOUND");
  });

  describe("where policy governance decides the version", () => {
    function appWith(binder: CapabilityPolicyBinder) {
      const app = express();
      app.use("/policies", createPolicyInEffectRouter(undefined, binder));
      return app;
    }

    it("answers with the approved version, not the one in code", async () => {
      const response = await request(
        appWith(
          new CapabilityPolicyBinder({
            async currentVersion() {
              return "1.2.0";
            },
          }),
        ),
      )
        .get("/policies/in-effect")
        .query({ capability: "paytm:refund" });

      expect(response.status).toBe(200);
      expect(response.body.policy).toEqual({
        name: "customer-refund",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      });
    });

    it("returns 503, not a partial answer, when the policy in effect cannot be read", async () => {
      const app = express();
      app.use(
        "/policies",
        createPolicyInEffectRouter(
          undefined,
          new CapabilityPolicyBinder({
            async currentVersion() {
              return "1.2.0";
            },
          }),
          async () => {
            throw new Error("storage unreachable");
          },
        ),
      );

      const response = await request(app)
        .get("/policies/in-effect")
        .query({ capability: "paytm:refund" });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("POLICY_VERSION_UNAVAILABLE");
      expect(response.body.signals).toBeUndefined();
    });

    it("returns 409 when no version was ever approved", async () => {
      const response = await request(
        appWith(
          new CapabilityPolicyBinder({
            async currentVersion() {
              return undefined;
            },
          }),
        ),
      )
        .get("/policies/in-effect")
        .query({ capability: "paytm:refund" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("NO_APPROVED_POLICY_VERSION");
    });

    it("returns 503, not a guessed version, when the lookup fails", async () => {
      const response = await request(
        appWith(
          new CapabilityPolicyBinder({
            async currentVersion() {
              throw new Error("database unreachable");
            },
          }),
        ),
      )
        .get("/policies/in-effect")
        .query({ capability: "paytm:refund" });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("POLICY_VERSION_UNAVAILABLE");
      expect(response.body.policy).toBeUndefined();
    });
  });
});
