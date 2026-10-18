import { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessTransaction, SignedApproval } from "@parmana/shared";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";
import {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
  deriveDeterministicPaytmRefId,
} from "@parmana/connector-paytm";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

//
// One trusted approver for this file only. Production ships
// TRUSTED_APPROVAL_ISSUERS empty (createApprovalIssuerRegistry.ts), so
// without this every approval would fail as an unknown issuer and the
// success path could never be exercised.
//
const approver = vi.hoisted(() => ({
  approverId: "manager-priya",
  keyId: "manager-priya-key-1",
}));

const approverKeys = generateKeyPairSync("ed25519");
const untrustedKeys = generateKeyPairSync("ed25519");

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
 * HTTP-level proof of the full governed Paytm refund path:
 *
 *   AI Agent -> POST /execute -> customer-refund@1.2.0 policy -> decision
 *     -> (APPROVED) -> Execution Gateway -> RemotePaytmConnector
 *     -> POST /connector/paytm-refund (a hermetic MockPaytmConnectorServer
 *        standing in for the trusted, out-of-process parmana-paytm-agent
 *        service) -> "Paytm"
 *
 * Uses the same real production bootstrap chain server.ts calls
 * (createExecutionSystem -> createExecutionGateway -> createExecutionControl
 * -> createConnectorRegistry), pointed at the mock connector service via
 * the PAYTM_CONNECTOR_URL test seam (see createPaytmConnector.ts) instead
 * of a hand-rolled recomposition -- this proves the actual production
 * wiring, not a look-alike of it. Every scenario uses the policy bound to
 * paytm:refund (customer-refund/1.2.0) unless it tests the binding itself;
 * the different outcome comes entirely from the payload/signals.
 *
 * Manager approval (G-65, G-75): since customer-refund 1.2.0 every
 * refund runs only with a signed Approval Artifact from a trusted
 * approver, declared in the policy's approvalSignals and enforced by
 * ApprovalSignalVerifier before authorization and again in the
 * Execution Gateway at release.
 */
describe("Paytm refund (HTTP boundary)", () => {
  let server: MockPaytmConnectorServer | undefined;
  const originalPaytmBaseUrl = process.env.PAYTM_CONNECTOR_URL;
  const originalTestSecret = process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (originalPaytmBaseUrl === undefined) {
      delete process.env.PAYTM_CONNECTOR_URL;
    } else {
      process.env.PAYTM_CONNECTOR_URL = originalPaytmBaseUrl;
    }
    if (originalTestSecret === undefined) {
      delete process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET;
    } else {
      process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET = originalTestSecret;
    }
  });

  const SECRET = PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;

  async function buildApp(): Promise<{
    app: ReturnType<typeof createApp>;
    server: MockPaytmConnectorServer;
  }> {
    const mockServer = new MockPaytmConnectorServer({ sharedSecret: SECRET });
    await mockServer.listen();
    server = mockServer;

    process.env.PAYTM_CONNECTOR_URL = mockServer.baseUrl;

    // Hermetic regardless of the ambient environment, matching
    // hubspot-deal-update.integration.test.ts's own reasoning: this
    // mock server only recognizes the built-in placeholder secret, so
    // it must not depend on TEST_PAYTM_CONNECTOR_SHARED_SECRET being
    // ambiently absent.
    process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET = SECRET;

    const executionSystem = await createExecutionSystem();
    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    return { app, server: mockServer };
  }

  function refundTransaction(overrides: {
    orderId: string;
    transactionId: string;
    amount: number;
    signals: BusinessTransaction["signals"];
    policy?: BusinessTransaction["policy"];
    extraParameters?: Readonly<Record<string, unknown>>;
  }): BusinessTransaction {
    const businessTransactionId = crypto.randomUUID();
    const authorityId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const intentId = crypto.randomUUID();

    return {
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
        action: "paytm:refund",
        target: `paytm://orders/${overrides.orderId}`,
        parameters: Object.freeze({
          orderId: overrides.orderId,
          transactionId: overrides.transactionId,
          amount: overrides.amount,
          ...overrides.extraParameters,
        }),
        createdAt: new Date(),
      },

      policy: overrides.policy ?? {
        name: "customer-refund",
        version: "1.2.0",
        schemaVersion: "1.0.0",
      },

      signals: overrides.signals,

      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;
  }

  async function signApproval(options: {
    orderId: string;
    maxAmount: number;
    privateKey?: typeof approverKeys.privateKey;
    capability?: string;
  }): Promise<SignedApproval> {
    return new ApprovalArtifactSigner().sign(
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        capability: options.capability ?? "paytm:refund",
        resourceId: options.orderId,
        scope: { field: "value", comparator: "lte", value: options.maxAmount },
        ttlSeconds: 900,
      },
      options.privateKey ?? approverKeys.privateKey,
    );
  }

  function approvedSignals(
    amount: number,
    approvalArtifact?: SignedApproval,
  ): BusinessTransaction["signals"] {
    return {
      refundEligible: true,
      managerApproved: true,
      fraudCheckPassed: true,
      refundAmount: amount,
      ...(approvalArtifact !== undefined
        ? { approvalArtifact: JSON.parse(JSON.stringify(approvalArtifact)) }
        : {}),
    } as BusinessTransaction["signals"];
  }

  function expectNoPaytmCall(
    mockServer: MockPaytmConnectorServer,
    fetchSpy: ReturnType<typeof vi.spyOn>,
  ): void {
    const paytmCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith(mockServer.baseUrl),
    );
    expect(paytmCalls).toHaveLength(0);
    expect(mockServer.calls).toHaveLength(0);
    expect(mockServer.paytmInvocationCount).toBe(0);
  }

  it("Scenario B: authorizes and executes a small refund with a signed manager approval through POST /execute, landing on the mock Paytm connector service exactly once", async () => {
    const { app, server: mockServer } = await buildApp();

    const transaction = refundTransaction({
      orderId: "order-approved-1",
      transactionId: "txn-approved-1",
      amount: 500,
      signals: approvedSignals(
        500,
        await signApproval({ orderId: "order-approved-1", maxAmount: 500 }),
      ),
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);
    expect(mockServer.calls).toHaveLength(1);
    expect(mockServer.paytmInvocationCount).toBe(1);
  });

  it("G-75: rejects a small refund when the caller declares every fact true but attaches no approval, and never calls the Paytm connector", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const managerApproved of [false, true]) {
      const response = await request(app)
        .post("/execute")
        .send(
          refundTransaction({
            orderId: "order-self-declared-1",
            transactionId: "txn-self-declared-1",
            amount: 500,
            signals: {
              refundEligible: true,
              managerApproved,
              fraudCheckPassed: true,
              refundAmount: 500,
            },
          }),
        );

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("POLICY_DENIED");
    }

    expectNoPaytmCall(mockServer, fetchSpy);
  });

  it("G-75: rejects a refund of 0 even with a manager approval, and never calls the Paytm connector", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await request(app)
      .post("/execute")
      .send(
        refundTransaction({
          orderId: "order-zero-1",
          transactionId: "txn-zero-1",
          amount: 0,
          signals: approvedSignals(
            0,
            await signApproval({ orderId: "order-zero-1", maxAmount: 100 }),
          ),
        }),
      );

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("must be greater than 0");
    expectNoPaytmCall(mockServer, fetchSpy);
  });

  it("G-71: two refunds of one Paytm transaction with different refundReference values reach the connector with different refIds, and the reason is sent", async () => {
    const { app, server: mockServer } = await buildApp();

    for (const refundReference of ["REF-PART-1", "REF-PART-2"]) {
      const response = await request(app)
        .post("/execute")
        .send(
          refundTransaction({
            orderId: "order-partial-1",
            transactionId: "txn-partial-1",
            amount: 200,
            // One approval per refund: each is used once.
            signals: approvedSignals(
              200,
              await signApproval({
                orderId: "order-partial-1",
                maxAmount: 200,
              }),
            ),
            extraParameters: {
              refundReference,
              refundReason: "Partial return",
            },
          }),
        );
      expect(response.status).toBe(200);
    }

    expect(mockServer.calls).toHaveLength(2);
    expect(mockServer.calls[0]?.parameters.refId).toBe(
      deriveDeterministicPaytmRefId(
        "order-partial-1",
        "txn-partial-1",
        "REF-PART-1",
      ),
    );
    expect(mockServer.calls[1]?.parameters.refId).toBe(
      deriveDeterministicPaytmRefId(
        "order-partial-1",
        "txn-partial-1",
        "REF-PART-2",
      ),
    );
    expect(mockServer.calls[0]?.parameters.reason).toBe("Partial return");
  });

  it("Scenario A: rejects by policy through POST /execute and never calls the Paytm connector when a refund has no manager approval", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = refundTransaction({
      orderId: "order-denied-1",
      transactionId: "txn-denied-1",
      amount: 50_000,
      signals: {
        refundEligible: true,
        managerApproved: false,
        fraudCheckPassed: true,
        refundAmount: 50_000,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("needs a signed manager approval");
    expectNoPaytmCall(mockServer, fetchSpy);
  });

  it("rejects by policy through POST /execute and never calls the Paytm connector when the refund amount exceeds the maximum, even with a valid manager approval", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = refundTransaction({
      orderId: "order-excessive-1",
      transactionId: "txn-excessive-1",
      amount: 150_000,
      signals: approvedSignals(
        150_000,
        await signApproval({
          orderId: "order-excessive-1",
          maxAmount: 200_000,
        }),
      ),
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("exceeds the maximum of 100000");
    expectNoPaytmCall(mockServer, fetchSpy);
  });

  it("binding validation: rejects through POST /execute when the declared refund amount does not match the authorized execution amount, and never calls the Paytm connector", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // The Intent that would actually execute carries amount: 50000, but
    // the caller declares (a smaller, policy-satisfying) refundAmount:
    // 500 -- exactly the "authorized amount = 500, actual execution
    // amount = 50000" tamper scenario. SignalIntentBinder's boundSignals
    // enforcement (refundAmount -> parameters.amount) must catch this
    // before PolicyEngine.evaluate ever sees a self-consistent, trivially
    // approvable signal set.
    const transaction = refundTransaction({
      orderId: "order-tamper-1",
      transactionId: "txn-tamper-1",
      amount: 50_000,
      signals: {
        refundEligible: true,
        managerApproved: false,
        fraudCheckPassed: true,
        refundAmount: 500,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expectNoPaytmCall(mockServer, fetchSpy);
  });

  it("capability/policy binding: rejects through POST /execute when paytm:refund is paired with an unrelated, unprotected policy", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = refundTransaction({
      orderId: "order-mismatch-1",
      transactionId: "txn-mismatch-1",
      amount: 500,
      signals: {
        refundEligible: true,
        managerApproved: false,
        fraudCheckPassed: true,
        refundAmount: 500,
      },
      policy: {
        name: "hubspot-deal-update",
        version: "1.1.0",
        schemaVersion: "1.0.0",
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("paytm:refund");
    expect(response.body.error).toContain("customer-refund");
    expectNoPaytmCall(mockServer, fetchSpy);
  });

  it("refuses the previous customer-refund version 1.1.0 at load, since its automatic refunds need no signed human approval", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = refundTransaction({
      orderId: "order-old-version-1",
      transactionId: "txn-old-version-1",
      amount: 500,
      signals: {
        refundEligible: true,
        managerApproved: true,
        fraudCheckPassed: true,
        refundAmount: 500,
      },
      policy: {
        name: "customer-refund",
        version: "1.1.0",
        schemaVersion: "1.0.0",
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(
      "approves without a signed human approval",
    );
    expectNoPaytmCall(mockServer, fetchSpy);
  });

  it("rejects by policy through POST /execute and never calls the Paytm connector when the refund did not pass fraud assessment", async () => {
    const { app, server: mockServer } = await buildApp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = refundTransaction({
      orderId: "order-fraud-1",
      transactionId: "txn-fraud-1",
      amount: 500,
      signals: {
        refundEligible: true,
        managerApproved: false,
        fraudCheckPassed: false,
        refundAmount: 500,
      },
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("did not pass fraud assessment");
    expectNoPaytmCall(mockServer, fetchSpy);
  });

  describe("manager approval (G-65)", () => {
    it("executes a refund above 10000 exactly once when it carries a valid signed manager approval, passing both the authorization check and the gateway's check at release", async () => {
      const { app, server: mockServer } = await buildApp();

      const transaction = refundTransaction({
        orderId: "order-manager-1",
        transactionId: "txn-manager-1",
        amount: 75_000,
        signals: approvedSignals(
          75_000,
          await signApproval({ orderId: "order-manager-1", maxAmount: 75_000 }),
        ),
      });

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(200);
      expect(mockServer.calls).toHaveLength(1);
      expect(mockServer.paytmInvocationCount).toBe(1);
    });

    it("rejects managerApproved: true with no approval attached, even for a small refund, and never calls the Paytm connector", async () => {
      const { app, server: mockServer } = await buildApp();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const transaction = refundTransaction({
        orderId: "order-self-approved-1",
        transactionId: "txn-self-approved-1",
        amount: 500,
        signals: approvedSignals(500),
      });

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("POLICY_DENIED");
      expect(response.body.error).toContain(
        "managerApproved=true != verified managerApproved=false",
      );
      expectNoPaytmCall(mockServer, fetchSpy);
    });

    it("rejects an approval signed for a different order", async () => {
      const { app, server: mockServer } = await buildApp();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const transaction = refundTransaction({
        orderId: "order-manager-2",
        transactionId: "txn-manager-2",
        amount: 75_000,
        signals: approvedSignals(
          75_000,
          await signApproval({
            orderId: "some-other-order",
            maxAmount: 75_000,
          }),
        ),
      });

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("verified managerApproved=false");
      expectNoPaytmCall(mockServer, fetchSpy);
    });

    it("rejects an approval whose amount limit is below the refund amount", async () => {
      const { app, server: mockServer } = await buildApp();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const transaction = refundTransaction({
        orderId: "order-manager-3",
        transactionId: "txn-manager-3",
        amount: 75_000,
        signals: approvedSignals(
          75_000,
          await signApproval({ orderId: "order-manager-3", maxAmount: 20_000 }),
        ),
      });

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("verified managerApproved=false");
      expectNoPaytmCall(mockServer, fetchSpy);
    });

    it("rejects an approval signed by a key that is not a trusted approver", async () => {
      const { app, server: mockServer } = await buildApp();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const transaction = refundTransaction({
        orderId: "order-manager-4",
        transactionId: "txn-manager-4",
        amount: 75_000,
        signals: approvedSignals(
          75_000,
          await signApproval({
            orderId: "order-manager-4",
            maxAmount: 75_000,
            privateKey: untrustedKeys.privateKey,
          }),
        ),
      });

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("verified managerApproved=false");
      expectNoPaytmCall(mockServer, fetchSpy);
    });

    it("rejects an approval whose signed amount limit was changed after signing", async () => {
      const { app, server: mockServer } = await buildApp();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const approval = await signApproval({
        orderId: "order-manager-5",
        maxAmount: 20_000,
      });
      const tampered = {
        ...approval,
        payload: {
          ...approval.payload,
          scope: { field: "value", comparator: "lte" as const, value: 75_000 },
        },
      };

      const transaction = refundTransaction({
        orderId: "order-manager-5",
        transactionId: "txn-manager-5",
        amount: 75_000,
        signals: approvedSignals(75_000, tampered),
      });

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("verified managerApproved=false");
      expectNoPaytmCall(mockServer, fetchSpy);
    });

    it("rejects an approval for another capability", async () => {
      const { app, server: mockServer } = await buildApp();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const transaction = refundTransaction({
        orderId: "order-manager-6",
        transactionId: "txn-manager-6",
        amount: 75_000,
        signals: approvedSignals(
          75_000,
          await signApproval({
            orderId: "order-manager-6",
            maxAmount: 75_000,
            capability: "hubspot:deal-update",
          }),
        ),
      });

      const response = await request(app).post("/execute").send(transaction);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("verified managerApproved=false");
      expectNoPaytmCall(mockServer, fetchSpy);
    });

    it("accepts an approval once: the same approval on a second, new request is rejected and the connector is called only for the first", async () => {
      const { app, server: mockServer } = await buildApp();

      const approval = await signApproval({
        orderId: "order-manager-7",
        maxAmount: 75_000,
      });

      const first = await request(app)
        .post("/execute")
        .send(
          refundTransaction({
            orderId: "order-manager-7",
            transactionId: "txn-manager-7",
            amount: 75_000,
            signals: approvedSignals(75_000, approval),
          }),
        );

      const second = await request(app)
        .post("/execute")
        .send(
          refundTransaction({
            orderId: "order-manager-7",
            transactionId: "txn-manager-7",
            amount: 75_000,
            signals: approvedSignals(75_000, approval),
          }),
        );

      expect(first.status).toBe(200);
      expect(second.status).toBe(403);
      expect(second.body.error).toContain("verified managerApproved=false");
      expect(mockServer.paytmInvocationCount).toBe(1);
    });
  });
});
