import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ExecutionRejectedError,
  HttpTransport,
  InternalServerError,
  ParmanaClient,
} from "@parmana/sdk";
import type { BusinessTransaction } from "@parmana/sdk";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

import {
  resolveHubSpotLiveGate,
  resolveHubSpotTestDealGate,
} from "../helpers/hubspot-live-availability.js";

const hubspotLiveConfigured = resolveHubSpotLiveGate(
  "HubSpot Live Integration",
);

/**
 * Second gating tier (see resolveHubSpotTestDealGate's comment): only
 * consulted once the base live gate above is already active, so a
 * machine with TEST_HUBSPOT_DEAL_ID set but no opt-in never even
 * evaluates it.
 */
const testDealId = hubspotLiveConfigured
  ? resolveHubSpotTestDealGate("HubSpot Live Deal Update")
  : undefined;

/**
 * The first network call this codebase ever makes to a real HubSpot
 * endpoint (api.hubapi.com), gated exactly like
 * razorpay-live.integration.test.ts gates on ALLOW_LIVE_RAZORPAY — see
 * resolveHubSpotLiveGate's comment and packages/api/README.md.
 *
 * Two independent gating tiers govern this file (mirroring Razorpay's
 * own live suite exactly):
 *
 *   1. ALLOW_LIVE_HUBSPOT=1 + TEST_HUBSPOT_PRIVATE_APP_TOKEN
 *      (pat--prefixed, checked before any network call) — gates this
 *      entire file. Absent: everything below skips cleanly.
 *   2. TEST_HUBSPOT_DEAL_ID — a real test deal in a free HubSpot
 *      developer/test account, required only by the nested "HubSpot
 *      live deal update (mutating)" describe block. Absent: only that
 *      block skips; the reachability/denial cases above it still run.
 *
 * Policy evaluation on the generic POST /execute path is against
 * caller-supplied signals (the same mechanism razorpay-live.integration.
 * test.ts's own reachability tests use) — not HubSpotDealUpdateService's
 * separate fetch-then-evaluate flow, which remains unit-test-only.
 *
 * Driven through the real, installable @parmana/sdk package (built to
 * typescript/dist/ — a devDependency of this package, resolved via the
 * npm workspace link, not a relative import into typescript/src/), over
 * a real listening HTTP server, instead of supertest driving the
 * in-process Express app object directly. This is the one gated live
 * suite this dogfooding pass rewrote end to end; see CLAIMS.md for what
 * this does and does not yet prove. Prerequisite: `npm run build` in
 * typescript/ must have already produced dist/ — already true in CI
 * (ci.yml builds before testing) and after any local `npm run build`
 * at the repo root.
 */
describe.skipIf(!hubspotLiveConfigured)(
  "HubSpot live (through the real @parmana/sdk package)",
  () => {
    const originalHubSpotBaseUrl = process.env.HUBSPOT_BASE_URL;

    let server: Server;
    let client: ParmanaClient;

    beforeAll(async () => {
      // No bridge needed: createHubSpotCredentialProvider.ts's NODE_ENV=test
      // branch reads TEST_HUBSPOT_PRIVATE_APP_TOKEN directly — the same
      // name documented in .env.example — so the real test token already
      // sitting in the environment is picked up with no test-side
      // mutation, and never appears in a variable, log, or assertion below.

      // No HUBSPOT_BASE_URL override: HubSpotConnector falls back to its
      // own default, HubSpot's real base URL (https://api.hubapi.com).
      delete process.env.HUBSPOT_BASE_URL;

      const executionSystem = await createExecutionSystem();
      const application = createApplication(executionSystem);
      const app = createApp(application, { callerAuth: "disabled" });

      server = await new Promise<Server>((resolve) => {
        const httpServer = app.listen(0, "127.0.0.1", () =>
          resolve(httpServer),
        );
      });

      const address = server.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${address.port}`;

      client = new ParmanaClient({
        endpoint,
        transport: new HttpTransport({ endpoint }),
      });
    });

    afterAll(async () => {
      if (originalHubSpotBaseUrl === undefined) {
        delete process.env.HUBSPOT_BASE_URL;
      } else {
        process.env.HUBSPOT_BASE_URL = originalHubSpotBaseUrl;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    interface ObservedCall {
      method: string;
      url: string;
      status: number;
    }

    let realFetch: typeof fetch;
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let observed: ObservedCall[] = [];

    beforeAll(() => {
      realFetch = globalThis.fetch.bind(globalThis);
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
          const response = await realFetch(input, init);
          observed.push({
            method: init?.method ?? "GET",
            url: String(input),
            status: response.status,
          });
          // Returned untouched (body never consumed here) so production
          // behavior — including HubSpotConnector's own parseOrFailClosed
          // handling — is entirely unaffected. This also transparently
          // records the SDK's own HttpTransport calls to the local server
          // above (http://127.0.0.1:<port>/...); every assertion below
          // filters specifically for the real HubSpot origin, so those
          // extra local entries never affect any "zero HubSpot calls" check.
          return response;
        });
    });

    afterAll(() => {
      fetchSpy.mockRestore();
    });

    afterEach(() => {
      observed = [];
    });

    function liveTransaction(overrides: {
      dealId: string;
      dealstage?: string;
      amount?: number;
      signals: BusinessTransaction["signals"];
    }): BusinessTransaction {
      const businessTransactionId = randomUUID();
      const authorityId = randomUUID();
      const authorizationId = randomUUID();
      const intentId = randomUUID();
      const now = new Date();

      return {
        businessTransactionId,

        metadata: {
          businessTransactionId,
          correlationId: randomUUID(),
          sourceSystem: "hubspot-live-integration-test",
          submittedBy: "hubspot-live-integration-test",
          submittedAt: now,
        },

        authority: {
          authorityId,
          authorityType: "USER",
          principalId: "hubspot-live-integration-test",
          displayName: "HubSpot Live Integration Test",
          issuedAt: now,
        },

        authorization: {
          authorizationId,
          authorityId,
          purpose: "HubSpot live integration test",
          issuedAt: now,
        },

        intent: {
          intentId,
          authorizationId,
          action: "hubspot:deal-update",
          target: `hubspot://deals/${overrides.dealId}`,
          parameters: {
            dealId: overrides.dealId,
            ...(overrides.dealstage !== undefined
              ? { dealstage: overrides.dealstage }
              : {}),
            ...(overrides.amount !== undefined
              ? { amount: overrides.amount }
              : {}),
          },
          createdAt: now,
        },

        policy: {
          name: "hubspot-deal-update",
          version: "1.0.0",
          schemaVersion: "1.0.0",
        },

        signals: overrides.signals,

        status: "RECEIVED",
        createdAt: now,
      };
    }

    function fetchDealTransaction(dealId: string): BusinessTransaction {
      return liveTransaction({
        dealId,
        // Reused deliberately: no dedicated fetch-only policy pack exists.
        // Policy evaluation is generic over caller-supplied signals and
        // independent of which capability intent.action names — this
        // pack's APPROVE rule is satisfied by these signals regardless.
        signals: {
          currentDealStage: "appointmentscheduled",
          dealStageChangeRequested: false,
          dealStageTransitionAllowed: true,
          amountChangeRequested: false,
          amountDeltaAbs: 0,
          amountChangeExceedsThreshold: false,
          preAuthorizedForAmountChange: false,
        },
      });
    }

    // Fixed, deliberately non-existent deal id: real enough to be
    // well-formed (HubSpot deal ids are numeric), but guaranteed never to
    // exist in any HubSpot account, so this test can never mutate real
    // data no matter which account the supplied token belongs to.
    const NON_EXISTENT_DEAL_ID = "999999999999";

    it("drives hubspot:deal-fetch through a real POST /execute (via the SDK) to the live HubSpot API", async () => {
      const transaction = fetchDealTransaction(NON_EXISTENT_DEAL_ID);

      let caught: unknown;
      try {
        await client.execute(transaction);
      } catch (error) {
        caught = error;
      }

      // The connector's real error detail is swallowed by the generic
      // error handler (mirrors razorpay-live.integration.test.ts's own
      // documented behavior) — this only proves the full chain ran and
      // reached the connector's failure path, thrown as the SDK's
      // typed InternalServerError.
      expect(caught).toBeInstanceOf(InternalServerError);
      expect((caught as InternalServerError).message).toBe(
        "Internal Server Error",
      );

      // The independent, out-of-band proof that this specific failure
      // came from a genuine HubSpot HTTP response, not a network
      // failure or a bug that never left this process: exactly one real
      // call landed on api.hubapi.com, and a real client-error status
      // came back.
      const hubspotCalls = observed.filter(
        (entry) =>
          new URL(entry.url).host === "api.hubapi.com" &&
          new URL(entry.url).pathname.startsWith("/crm/v3/objects/deals/"),
      );
      expect(hubspotCalls).toHaveLength(1);
      expect(hubspotCalls[0]?.status).toBeGreaterThanOrEqual(400);
    }, 30_000);

    it("denies a disallowed dealstage transition through POST /execute (via the SDK) before any HubSpot call", async () => {
      const transaction = liveTransaction({
        dealId: NON_EXISTENT_DEAL_ID,
        dealstage: "qualifiedtobuy",
        signals: {
          currentDealStage: "closedlost",
          proposedDealStage: "qualifiedtobuy",
          dealStageChangeRequested: true,
          dealStageTransitionAllowed: false,
          amountChangeRequested: false,
          amountDeltaAbs: 0,
          amountChangeExceedsThreshold: false,
          preAuthorizedForAmountChange: false,
        },
      });

      let caught: unknown;
      try {
        await client.execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ExecutionRejectedError);

      // Policy rejection happens in ExecutionGate.enforce, before
      // ExecutionComponent ever dispatches to the connector — zero real
      // HubSpot calls for the denial itself.
      const hubspotCalls = observed.filter(
        (entry) => new URL(entry.url).host === "api.hubapi.com",
      );
      expect(hubspotCalls).toHaveLength(0);
    }, 30_000);

    /**
     * Third gating tier: TEST_HUBSPOT_DEAL_ID (see
     * resolveHubSpotTestDealGate's comment). This is the only place in
     * the suite that ever mutates a real HubSpot object — everything
     * above targets a deal id guaranteed not to exist, or denies before
     * any connector dispatch.
     *
     * Non-destructive by construction: the real deal's amount is read
     * live, nudged by a small, within-threshold delta, verified via an
     * independent live GET, then reverted to its original value in the
     * same test — so repeated suite runs never leave the test deal in a
     * different state than they found it, unlike Razorpay's refund
     * (irreversible; its remainder depletes per run).
     */
    describe.skipIf(testDealId === undefined)(
      "HubSpot live deal update (mutating)",
      () => {
        const dealId = testDealId as string;

        /**
         * Test-side verification oracle: an independent, read-only HubSpot
         * call made OUTSIDE the production chain under test, mirroring
         * razorpay-live.integration.test.ts's own fetchRefundsLive pattern.
         * Uses realFetch directly (bypassing the fetchSpy/observed
         * instrumentation, which exists to trace the SYSTEM UNDER TEST's own
         * calls) and constructs Bearer auth the same way HubSpotConnector
         * does — not a direct connector call.
         */
        async function fetchDealLive(): Promise<{
          amount?: string;
          dealstage?: string;
        }> {
          const token = process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN as string;
          const response = await realFetch(
            `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealstage,amount`,
            { method: "GET", headers: { Authorization: `Bearer ${token}` } },
          );
          const body = (await response.json()) as {
            properties?: { amount?: string; dealstage?: string };
          };
          return body.properties ?? {};
        }

        it("reads the real deal, applies a small within-threshold amount change through POST /execute (via the SDK), verifies it live, then reverts it", async () => {
          const before = await fetchDealLive();
          const originalAmount =
            before.amount !== undefined ? Number(before.amount) : 0;

          // Fixed, small, always within HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD
          // (10000): never requires pre-authorization.
          const DELTA = 1;
          const nudgedAmount = originalAmount + DELTA;

          const updateTransaction = liveTransaction({
            dealId,
            amount: nudgedAmount,
            signals: {
              currentDealStage: before.dealstage ?? "",
              dealStageChangeRequested: false,
              dealStageTransitionAllowed: true,
              amountChangeRequested: true,
              // Must equal parameters.amount exactly: boundSignals binds
              // proposedAmount to it, and SignalIntentBinder rejects any
              // mismatch (including an absent signal against a present
              // Intent field) before PolicyEngine ever runs.
              proposedAmount: nudgedAmount,
              amountDeltaAbs: DELTA,
              amountChangeExceedsThreshold: false,
              preAuthorizedForAmountChange: false,
            },
          });

          const trustRecord = await client.execute(updateTransaction);
          expect(trustRecord.businessTransactionId).toBe(
            updateTransaction.businessTransactionId,
          );

          const afterNudge = await fetchDealLive();
          expect(Number(afterNudge.amount)).toBe(nudgedAmount);

          // Revert: same small delta, opposite direction, also within
          // threshold — leaves the test deal exactly as found.
          const revertTransaction = liveTransaction({
            dealId,
            amount: originalAmount,
            signals: {
              currentDealStage: before.dealstage ?? "",
              dealStageChangeRequested: false,
              dealStageTransitionAllowed: true,
              amountChangeRequested: true,
              proposedAmount: originalAmount,
              amountDeltaAbs: DELTA,
              amountChangeExceedsThreshold: false,
              preAuthorizedForAmountChange: false,
            },
          });

          const revertTrustRecord = await client.execute(revertTransaction);
          expect(revertTrustRecord.businessTransactionId).toBe(
            revertTransaction.businessTransactionId,
          );

          const afterRevert = await fetchDealLive();
          expect(Number(afterRevert.amount)).toBe(originalAmount);
        }, 30_000);
      },
    );
  },
);
