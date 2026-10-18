import { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessTransaction } from "@parmana/shared";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import {
  MockHubSpotServer,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-hubspot";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";
import { withTestApproval } from "../../../../test-support/approvals.js";

//
// One trusted approver for this file only, so the success path of an
// approved over threshold amount change can be exercised end to end.
// "manager-jane", used by the TD-23 case below, is deliberately not in
// this list and stays untrusted.
//
const approver = vi.hoisted(() => ({
  approverId: "manager-priya",
  keyId: "manager-priya-key-1",
}));

const approverKeys = generateKeyPairSync("ed25519");

vi.mock("../../src/bootstrap/createApprovalIssuerRegistry.js", () => ({
  createApprovalIssuerRegistry: () =>
    new StaticApprovalIssuerRegistry([
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        publicKey: approverKeys.publicKey,
        revoked: false,
      },
    ]),
}));

/**
 * HTTP-level proof that the HubSpot deal-update connector is reachable
 * through the real, production-wired API — not only through unit tests
 * (packages/connector-hubspot/tests/unit/*.test.ts).
 *
 * Uses the same real production bootstrap chain server.ts calls
 * (createExecutionSystem -> createExecutionGateway ->
 * createExecutionControl -> createConnectorRegistry), pointed at a
 * hermetic MockHubSpotServer via the HUBSPOT_BASE_URL test seam (see
 * createHubSpotConnector.ts) instead of a hand-rolled recomposition, so
 * this proves the actual production wiring — not a look-alike of it.
 *
 * Policy evaluation here happens against caller-supplied signals, the
 * same generic mechanism vendor-payment/razorpay already go through (see
 * razorpay-refund.integration.test.ts's own header comment) — not
 * HubSpotDealUpdateService's separate, stronger-guarantee,
 * fetch-deal-before-evaluating flow, which remains unit-test-only and
 * unchanged.
 *
 * The policy-denial case below is this milestone's "policy-denial-makes-
 * zero-calls" proof, asserted the same way
 * razorpay-refund.integration.test.ts's own denial test asserts it
 * (rejects by policy through POST /execute and never calls the vendor
 * API) — reinforced here with a fetch spy asserting literally zero calls
 * reached the mock server, since a policy REJECTED decision is caught in
 * ExecutionGate.enforce before ExecutionComponent ever dispatches to the
 * connector.
 */
describe("HubSpot deal update (HTTP boundary)", () => {
  let server: MockHubSpotServer | undefined;
  const originalHubSpotBaseUrl = process.env.HUBSPOT_BASE_URL;
  const originalTestToken = process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN;

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (originalHubSpotBaseUrl === undefined) {
      delete process.env.HUBSPOT_BASE_URL;
    } else {
      process.env.HUBSPOT_BASE_URL = originalHubSpotBaseUrl;
    }
    if (originalTestToken === undefined) {
      delete process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN;
    } else {
      process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN = originalTestToken;
    }
  });

  const TOKEN = HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN;

  async function buildApp(): Promise<{
    app: ReturnType<typeof createApp>;
    server: MockHubSpotServer;
  }> {
    const mockServer = new MockHubSpotServer({ token: TOKEN });
    await mockServer.listen();
    server = mockServer;

    process.env.HUBSPOT_BASE_URL = mockServer.baseUrl;

    // Hermetic regardless of the ambient environment: this test's mock
    // server only recognizes the built-in placeholder credential, so it
    // must not depend on TEST_HUBSPOT_PRIVATE_APP_TOKEN being ambiently
    // absent — a machine with a real HubSpot live-test token configured
    // (for hubspot-live.integration.test.ts) must not leak it in here and
    // get rejected by this mock server as a mismatched credential.
    process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN = TOKEN;

    const executionSystem = await createExecutionSystem();
    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    return { app, server: mockServer };
  }

  /**
   * hubspot-deal-update 1.1.0: every update needs a signed approval for
   * the deal from a trusted person. Signed by this file's trusted
   * approver unless a test sets approved: false.
   */
  async function dealUpdateTransaction(overrides: {
    dealId: string;
    dealstage?: string;
    amount?: number;
    signals: BusinessTransaction["signals"];
    approved?: boolean;
  }): Promise<BusinessTransaction> {
    const businessTransactionId = crypto.randomUUID();
    const authorityId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const intentId = crypto.randomUUID();

    const transaction = {
      businessTransactionId,

      metadata: {
        businessTransactionId,
        correlationId: crypto.randomUUID(),
        createdBy: "integration-test",
        createdAt: new Date(),
      },

      authority: {
        authorityId,
        authorityType: "USER",
        principalId: "integration-test",
        displayName: "Integration Test",
        issuedAt: new Date(),
      },

      authorization: {
        authorizationId,
        authorityId,
        purpose: "Integration Test",
        authorizedAt: new Date(),
      },

      intent: {
        intentId,
        authorizationId,
        action: "hubspot:deal-update",
        target: `hubspot://deals/${overrides.dealId}`,
        parameters: Object.freeze({
          dealId: overrides.dealId,
          ...(overrides.dealstage !== undefined
            ? { dealstage: overrides.dealstage }
            : {}),
          ...(overrides.amount !== undefined
            ? { amount: overrides.amount }
            : {}),
        }),
        createdAt: new Date(),
      },

      policy: {
        name: "hubspot-deal-update",
        version: "1.1.0",
        schemaVersion: "1.0.0",
      },

      signals: overrides.signals,

      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;

    if (overrides.approved === false) {
      return transaction;
    }

    return withTestApproval(transaction, undefined, {
      ...approver,
      privateKey: approverKeys.privateKey,
    });
  }

  it("authorizes and executes a real dealstage update through POST /execute, landing on the mock HubSpot server", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setDeal({
      id: "9001",
      properties: {
        dealstage: "appointmentscheduled",
        amount: "5000",
        pipeline: "default",
      },
    });

    const transaction = await dealUpdateTransaction({
      dealId: "9001",
      dealstage: "qualifiedtobuy",
      signals: {
        currentDealStage: "appointmentscheduled",
        proposedDealStage: "qualifiedtobuy",
        dealStageChangeRequested: true,
        dealStageTransitionAllowed: true,
        amountChangeRequested: false,
        amountDeltaAbs: 0,
        amountChangeExceedsThreshold: false,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);

    // The strongest proof this went through the real HTTP surface end to
    // end: the deal actually moved on the (mock) HubSpot server, not
    // just that the API returned 200.
    expect(mockServer.getDeal("9001")?.properties.dealstage).toBe(
      "qualifiedtobuy",
    );
  });

  it("rejects by policy through POST /execute and never calls HubSpot when the dealstage transition is not on an allowed path", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setDeal({
      id: "9002",
      properties: {
        dealstage: "closedlost",
        amount: "5000",
        pipeline: "default",
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = await dealUpdateTransaction({
      dealId: "9002",
      // closedlost is terminal: never an allowed transition out of it.
      dealstage: "qualifiedtobuy",
      signals: {
        currentDealStage: "closedlost",
        proposedDealStage: "qualifiedtobuy",
        dealStageChangeRequested: true,
        dealStageTransitionAllowed: false,
        amountChangeRequested: false,
        amountDeltaAbs: 0,
        amountChangeExceedsThreshold: false,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    // A policy denial is a deliberate, correct rejection — 403, distinct
    // from a genuine server error (500) or a replayed authorization (409).
    expect(response.status).toBe(403);
    expect(response.body.error).toContain("rejected");
    expect(response.body.code).toBe("POLICY_DENIED");

    // The deal is untouched on HubSpot's (mock) side.
    expect(mockServer.getDeal("9002")?.properties.dealstage).toBe("closedlost");

    // The strongest possible proof of "zero HubSpot API calls": not even
    // a network call was made to the mock server for this denial — the
    // policy REJECTED decision is caught in ExecutionGate.enforce before
    // ExecutionComponent ever dispatches to the connector.
    const hubspotCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith(mockServer.baseUrl),
    );
    expect(hubspotCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it("rejects by policy through POST /execute and never changes the deal when an update has no signed approval", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setDeal({
      id: "9003",
      properties: {
        dealstage: "appointmentscheduled",
        amount: "5000",
        pipeline: "default",
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Every fact is true of the real deal and the agent declares the
    // approval signal true, but no signed approval backs it.
    const transaction = await dealUpdateTransaction({
      dealId: "9003",
      dealstage: "qualifiedtobuy",
      approved: false,
      signals: {
        dealUpdateApproved: true,
        currentDealStage: "appointmentscheduled",
        proposedDealStage: "qualifiedtobuy",
        dealStageChangeRequested: true,
        dealStageTransitionAllowed: true,
        amountChangeRequested: false,
        amountDeltaAbs: 0,
        amountChangeExceedsThreshold: false,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("dealUpdateApproved");

    expect(mockServer.getDeal("9003")?.properties.dealstage).toBe(
      "appointmentscheduled",
    );

    const hubspotPatchCalls = fetchSpy.mock.calls.filter(
      (call) =>
        String(call[0]).startsWith(mockServer.baseUrl) &&
        (call[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(hubspotPatchCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it("rejects by policy through POST /execute when caller-declared signals misrepresent the real HubSpot deal state", async () => {
    const { app, server: mockServer } = await buildApp();

    // Real deal: already closedlost (terminal) -- no forward transition is ever allowed out of it.
    mockServer.setDeal({
      id: "9004",
      properties: {
        dealstage: "closedlost",
        amount: "5000",
        pipeline: "default",
      },
    });

    // Caller-declared signals falsely claim the deal is still at an early, non-terminal
    // stage, so the proposed forward transition appears allowed -- untrue against the
    // real deal.
    const transaction = await dealUpdateTransaction({
      dealId: "9004",
      dealstage: "qualifiedtobuy",
      signals: {
        currentDealStage: "appointmentscheduled",
        proposedDealStage: "qualifiedtobuy",
        dealStageChangeRequested: true,
        dealStageTransitionAllowed: true,
        amountChangeRequested: false,
        amountDeltaAbs: 0,
        amountChangeExceedsThreshold: false,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");

    // The strongest proof: the deal is untouched on HubSpot's (mock) side, even though
    // the caller-declared signals alone would have satisfied every policy rule.
    expect(mockServer.getDeal("9004")?.properties.dealstage).toBe("closedlost");
  });

  it("(TD-22) rejects by policy through POST /execute when hubspot:deal-update is paired with an unrelated, unprotected policy", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setDeal({
      id: "9005",
      properties: {
        dealstage: "closedlost",
        amount: "5000",
        pipeline: "default",
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // The same live-shaped exploit as razorpay-refund.integration.test.ts's
    // TD-22 case, for the other fund/record-mutating capability:
    // hubspot:deal-update paired with customer-refund/1.2.0, a real,
    // production-loadable policy with no boundSignals for dealstage/amount
    // at all. Its own approve rule is trivially satisfiable by
    // caller-declared signals alone, entirely decoupled from the real
    // intent.parameters.dealstage/amount that would actually execute --
    // here, moving a deal out of a terminal closedlost stage, which the
    // real hubspot-deal-update policy would never allow.
    const transaction = {
      ...(await dealUpdateTransaction({
        dealId: "9005",
        dealstage: "qualifiedtobuy",
        amount: 999_999,
        signals: {
          refundEligible: true,
          managerApproved: true,
          fraudCheckPassed: true,
          refundAmount: 1,
        },
      })),
      policy: {
        name: "customer-refund",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      },
    };

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("hubspot:deal-update");
    expect(response.body.error).toContain("hubspot-deal-update");
    expect(response.body.error).toContain("customer-refund");

    // The deal is untouched, and not even a network call was made -- the
    // mismatched policy never even reaches PolicyEngine.evaluate.
    expect(mockServer.getDeal("9005")?.properties.dealstage).toBe("closedlost");
    const hubspotCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith(mockServer.baseUrl),
    );
    expect(hubspotCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it("(TD-23) rejects by policy through POST /execute when the approval is signed by an approver that is not trusted", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setDeal({
      id: "9006",
      properties: {
        dealstage: "appointmentscheduled",
        amount: "5000",
        pipeline: "default",
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Proves the real, production-wired default posture is fail-closed:
    // createApprovalIssuerRegistry.ts starts with zero trusted issuers
    // configured (see its own comment), so no Approval Artifact --
    // however well-formed -- can ever verify through the real API
    // until an operator provisions a real approver key. A caller
    // declaring dealUpdateApproved: true and presenting a
    // well-formed (but necessarily untrusted) artifact must still be
    // rejected, exactly like declaring it with no artifact at all
    // (see the "no signed approval" case above) -- the
    // declared claim is no longer trusted verbatim.
    const transaction = await dealUpdateTransaction({
      dealId: "9006",
      amount: 50_000,
      approved: false,
      signals: {
        currentDealStage: "appointmentscheduled",
        proposedAmount: 50_000,
        dealStageChangeRequested: false,
        dealStageTransitionAllowed: true,
        amountChangeRequested: true,
        amountDeltaAbs: 45_000,
        amountChangeExceedsThreshold: true,
        dealUpdateApproved: true,
        approvalArtifact: {
          payload: {
            version: 1,
            approvalId: "approval-1",
            issuer: { approverId: "manager-jane", keyId: "manager-jane-key-1" },
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            capability: "hubspot:deal-update",
            resourceId: "9006",
            scope: { field: "resourceId", comparator: "eq", value: "9006" },
            nonce: "integration-test-nonce-1",
          },
          signature: {
            algorithm: "ed25519",
            keyId: "manager-jane-key-1",
            value: "not-a-real-signature",
            signedAt: new Date().toISOString(),
          },
        },
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("dealUpdateApproved");

    // The deal is untouched -- the provisional decision was APPROVE
    // (the caller's declared dealUpdateApproved: true
    // satisfies the policy on its face), so HubSpotSignalStateVerifier
    // does perform its usual real, read-only deal-fetch to
    // independently verify state (one GET call below) -- but that
    // verification is exactly what catches the untrusted artifact and
    // overrides the decision to REJECT before any mutating PATCH call
    // is ever made.
    expect(mockServer.getDeal("9006")?.properties.amount).toBe("5000");

    const hubspotPatchCalls = fetchSpy.mock.calls.filter(
      (call) =>
        String(call[0]).startsWith(mockServer.baseUrl) &&
        (call[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(hubspotPatchCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });
  it("executes an over threshold amount change exactly once with a signed approval for the deal from a trusted approver, passing both the authorization check and the gateway's check at release", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setDeal({
      id: "9007",
      properties: {
        dealstage: "appointmentscheduled",
        amount: "5000",
        pipeline: "default",
      },
    });

    const transaction = await dealUpdateTransaction({
      dealId: "9007",
      amount: 50_000,
      signals: {
        currentDealStage: "appointmentscheduled",
        proposedAmount: 50_000,
        dealStageChangeRequested: false,
        dealStageTransitionAllowed: true,
        amountChangeRequested: true,
        amountDeltaAbs: 45_000,
        amountChangeExceedsThreshold: true,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);
    expect(mockServer.getDeal("9007")?.properties.amount).toBe("50000");
  });
});
