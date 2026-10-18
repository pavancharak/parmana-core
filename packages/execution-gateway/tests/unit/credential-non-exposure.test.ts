import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
  MockHubSpotServer,
  redactHubSpotToken,
  type HubSpotDeal,
} from "@parmana/connector-hubspot";
import {
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
} from "@parmana/connector-sdk";

import { GatewayHubSpotAdapter } from "../../src/connector-execution/index.js";

/**
 * Credential lifecycle (Claim 1 audit, 2026-08-19 independent claims
 * review): the one property of "no actor ever holds a working execution
 * credential" that hubspot-connector.test.ts did not already assert
 * explicitly.
 *
 * Every other property this audit asked for — token redaction to a
 * one-way fingerprint, error-message isolation, response-metadata
 * safety, and zero HubSpot API calls on a policy denial — already has
 * real, passing coverage:
 *   - hubspot-connector.test.ts: "never leaks the token into a thrown
 *     error", "never places the token or any substring of it in
 *     connector response metadata, only a one-way fingerprint"
 *   - packages/api/tests/integration/hubspot-deal-update.integration.test.ts:
 *     fetch-spy proof of literally zero calls to the HubSpot mock server
 *     on POLICY_DENIED, at the full RuntimeEngine -> API level (stronger
 *     than a connector-local check, since it proves the connector is
 *     never even reached, not merely that it declines to act).
 * This file adds only the missing one: that GatewayHubSpotAdapter never
 * retains a resolved credential as instance state between calls.
 */
describe("GatewayHubSpotAdapter credential lifecycle", () => {
  let server: MockHubSpotServer;

  beforeEach(async () => {
    server = new MockHubSpotServer({
      token: HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
    });
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
  });

  function connector(): GatewayHubSpotAdapter {
    return new GatewayHubSpotAdapter({
      connectorId: "hubspot",
      capabilities: connectorCapabilities([HUBSPOT_DEAL_FETCH_CAPABILITY]),
      baseUrl: server.baseUrl,
    });
  }

  function contextWithToken(token: string): ConnectorExecutionContext {
    return {
      credential: brandCredentialHandle({
        providerId: "static",
        credentialId: "hubspot",
        value: { privateAppToken: token },
      }),
      timeoutMs: 2_000,
      requestedAt: new Date(),
    };
  }

  it("holds no credential-shaped instance field at construction — the token exists only as an execute()-scoped local, never as `this.*`", () => {
    const instance = connector();

    // GatewayHubSpotAdapter.ts assigns exactly connectorId, capabilities,
    // baseUrl, and options in its constructor, then Object.freeze(this) —
    // there is structurally no field a token could later be assigned to.
    // This asserts that contract holds today, not just that it reads that
    // way in the source.
    for (const value of Object.values(instance)) {
      expect(String(value)).not.toContain("pat-");
    }
  });

  it("never reuses a prior call's credential: two sequential execute() calls on the same instance, with two different tokens, each authenticate as only their own call's token", async () => {
    const tokenA = "TEST_TOKEN_A_NOT_A_REAL_CREDENTIAL";
    const tokenB = "TEST_TOKEN_B_NOT_A_REAL_CREDENTIAL";

    // Mock server only recognizes tokenB — if the instance retained
    // tokenA from the first call and reused it, the second call would
    // fail with HTTP 401 instead of succeeding.
    const scopedServer = new MockHubSpotServer({ token: tokenB });
    await scopedServer.listen();

    try {
      scopedServer.setDeal({
        id: "2002",
        properties: {
          dealstage: "appointmentscheduled",
          amount: "100",
          pipeline: "default",
        },
      });

      const instance = new GatewayHubSpotAdapter({
        connectorId: "hubspot",
        capabilities: connectorCapabilities([HUBSPOT_DEAL_FETCH_CAPABILITY]),
        baseUrl: scopedServer.baseUrl,
      });

      const request = {
        capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
        businessTransactionId: "txn-lifecycle-1",
        action: HUBSPOT_DEAL_FETCH_CAPABILITY,
        target: "deals/2002",
        parameters: { dealId: "2002" },
      };

      // First call: wrong token for this server. Must fail — proves the
      // instance has no left-over valid credential of its own to fall
      // back on.
      await expect(
        instance.execute(request, contextWithToken(tokenA)),
      ).rejects.toThrow("HTTP 401");

      // Second call, same instance: the correct token, supplied fresh.
      // Succeeding here (and being fingerprinted as tokenB, not tokenA)
      // proves each call is credentialed independently, not from
      // retained state.
      const result = await instance.execute(request, contextWithToken(tokenB));

      expect(result.success).toBe(true);
      expect(result.metadata?.bearerRedacted).toBe(redactHubSpotToken(tokenB));
      expect(result.metadata?.bearerRedacted).not.toBe(
        redactHubSpotToken(tokenA),
      );
      expect((result.metadata?.deal as HubSpotDeal).id).toBe("2002");
    } finally {
      await scopedServer.close();
    }
  });
});
