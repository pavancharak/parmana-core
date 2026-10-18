import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
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

const TOKEN = HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN;

let server: MockHubSpotServer;

beforeEach(async () => {
  server = new MockHubSpotServer({ token: TOKEN });
  await server.listen();
});

afterEach(async () => {
  await server.close();
});

function context(
  overrides: Partial<ConnectorExecutionContext> = {},
): ConnectorExecutionContext {
  return {
    credential: brandCredentialHandle({
      providerId: "static",
      credentialId: "hubspot",
      value: { privateAppToken: TOKEN },
    }),
    timeoutMs: 2_000,
    requestedAt: new Date(),
    ...overrides,
  };
}

function connector(): GatewayHubSpotAdapter {
  return new GatewayHubSpotAdapter({
    connectorId: "hubspot",
    capabilities: connectorCapabilities([
      HUBSPOT_DEAL_FETCH_CAPABILITY,
      HUBSPOT_DEAL_UPDATE_CAPABILITY,
    ]),
    baseUrl: server.baseUrl,
  });
}

function seededDeal(
  overrides: Partial<HubSpotDeal["properties"]> = {},
): HubSpotDeal {
  return {
    id: "1001",
    properties: {
      dealstage: "appointmentscheduled",
      amount: "5000",
      pipeline: "default",
      ...overrides,
    },
  };
}

describe("GatewayHubSpotAdapter", () => {
  it("fetches a deal", async () => {
    server.setDeal(seededDeal());

    const result = await connector().execute(
      {
        capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
        businessTransactionId: "txn-1",
        action: HUBSPOT_DEAL_FETCH_CAPABILITY,
        target: "deals/1001",
        parameters: { dealId: "1001" },
      },
      context(),
    );

    expect(result.success).toBe(true);
    expect((result.metadata?.deal as HubSpotDeal).id).toBe("1001");
    expect((result.metadata?.deal as HubSpotDeal).properties.dealstage).toBe(
      "appointmentscheduled",
    );
  });

  it("updates a deal's dealstage", async () => {
    server.setDeal(seededDeal());

    const result = await connector().execute(
      {
        capability: HUBSPOT_DEAL_UPDATE_CAPABILITY,
        businessTransactionId: "txn-update-1",
        action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
        target: "deals/1001",
        parameters: { dealId: "1001", dealstage: "qualifiedtobuy" },
      },
      context(),
    );

    expect(result.success).toBe(true);
    const deal = result.metadata?.deal as HubSpotDeal;
    expect(deal.properties.dealstage).toBe("qualifiedtobuy");
    // amount was not part of this request: unchanged.
    expect(deal.properties.amount).toBe("5000");
    expect(server.getDeal("1001")?.properties.dealstage).toBe("qualifiedtobuy");
  });

  it("updates a deal's amount alongside dealstage in the same action", async () => {
    server.setDeal(seededDeal());

    const result = await connector().execute(
      {
        capability: HUBSPOT_DEAL_UPDATE_CAPABILITY,
        businessTransactionId: "txn-update-2",
        action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
        target: "deals/1001",
        parameters: {
          dealId: "1001",
          dealstage: "qualifiedtobuy",
          amount: 7500,
        },
      },
      context(),
    );

    const deal = result.metadata?.deal as HubSpotDeal;
    expect(deal.properties.dealstage).toBe("qualifiedtobuy");
    expect(deal.properties.amount).toBe("7500");
  });

  it("deny-by-default: refuses to update any property other than dealstage/amount, before any network call", async () => {
    server.setDeal(seededDeal());
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    let caught: unknown;
    try {
      await connector().execute(
        {
          capability: HUBSPOT_DEAL_UPDATE_CAPABILITY,
          businessTransactionId: "txn-disallowed-property",
          action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
          target: "deals/1001",
          parameters: {
            dealId: "1001",
            dealstage: "qualifiedtobuy",
            closedate: "2026-01-01",
          },
        },
        context(),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("closedate");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("rejects an update request naming neither dealstage nor amount", async () => {
    server.setDeal(seededDeal());

    await expect(
      connector().execute(
        {
          capability: HUBSPOT_DEAL_UPDATE_CAPABILITY,
          businessTransactionId: "txn-empty-update",
          action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
          target: "deals/1001",
          parameters: { dealId: "1001" },
        },
        context(),
      ),
    ).rejects.toThrow(/nothing to update/);
  });

  it("fails closed on a non-2xx response", async () => {
    // No deal seeded: the mock server returns 404.
    await expect(
      connector().execute(
        {
          capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
          businessTransactionId: "txn-missing",
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: "deals/9999",
          parameters: { dealId: "9999" },
        },
        context(),
      ),
    ).rejects.toThrow("HTTP 404");
  });

  it("fails closed on a timeout, never returning a partial success", async () => {
    server.setDeal(seededDeal());
    server.setResponseDelayMs(200);

    await expect(
      connector().execute(
        {
          capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
          businessTransactionId: "txn-timeout",
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: "deals/1001",
          parameters: { dealId: "1001" },
        },
        context({ timeoutMs: 20 }),
      ),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it("rejects a credential that is not a resolved HubSpot Private App token", async () => {
    server.setDeal(seededDeal());

    await expect(
      connector().execute(
        {
          capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
          businessTransactionId: "txn-bad-cred",
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: "deals/1001",
          parameters: { dealId: "1001" },
        },
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "hubspot",
            value: { token: "wrong-shape" },
          }),
        }),
      ),
    ).rejects.toThrow(/resolved HubSpot Private App token/);
  });

  it("never leaks the token into a thrown error, even on an authentication failure against the mock server", async () => {
    server.setDeal(seededDeal());

    let caught: unknown;
    try {
      await connector().execute(
        {
          capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
          businessTransactionId: "txn-wrong-token",
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: "deals/1001",
          parameters: { dealId: "1001" },
        },
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "hubspot",
            value: { privateAppToken: "wrong-token-value" },
          }),
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("HTTP 401");
    expect((caught as Error).message).not.toContain(TOKEN);
    expect((caught as Error).message).not.toContain("wrong-token-value");
  });

  it("never places the token or any substring of it in connector response metadata, only a one-way fingerprint (Phase 3D certification, Property A)", async () => {
    server.setDeal(seededDeal());

    const result = await connector().execute(
      {
        capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
        businessTransactionId: "txn-redaction",
        action: HUBSPOT_DEAL_FETCH_CAPABILITY,
        target: "deals/1001",
        parameters: { dealId: "1001" },
      },
      context(),
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TOKEN);
    // Not merely "no full token": no substring of it of meaningful length
    // either -- for HubSpot the bearer token IS the entire credential, so
    // the old truncated-literal-prefix format leaked
    // genuine credential bytes.
    expect(serialized).not.toContain(TOKEN.slice(0, 12));
    expect(result.metadata?.bearerRedacted).toBe(redactHubSpotToken(TOKEN));
    expect(result.metadata?.bearerRedacted).toMatch(/^fp_[0-9a-f]{12}$/);
  });

  it("refuses to send the built-in test-mode placeholder credential to HubSpot's real API, before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // No baseUrl override: defaults to GatewayHubSpotAdapter's own default,
    // HubSpot's real production API — this is exactly the unsafe
    // combination the guard exists to catch.
    const realBaseUrlConnector = new GatewayHubSpotAdapter({
      connectorId: "hubspot",
      capabilities: connectorCapabilities([
        HUBSPOT_DEAL_FETCH_CAPABILITY,
        HUBSPOT_DEAL_UPDATE_CAPABILITY,
      ]),
    });

    let caught: unknown;
    try {
      await realBaseUrlConnector.execute(
        {
          capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
          businessTransactionId: "txn-placeholder-guard",
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: "deals/1001",
          parameters: { dealId: "1001" },
        },
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "hubspot",
            value: { privateAppToken: HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN },
          }),
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("refuses to send");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("still allows the placeholder credential against a mock server (baseUrl override) — the guard is real-endpoint-specific", async () => {
    const placeholderMockServer = new MockHubSpotServer({
      token: HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
    });

    try {
      await placeholderMockServer.listen();
      placeholderMockServer.setDeal(seededDeal());

      const mockConnector = new GatewayHubSpotAdapter({
        connectorId: "hubspot",
        capabilities: connectorCapabilities([
          HUBSPOT_DEAL_FETCH_CAPABILITY,
          HUBSPOT_DEAL_UPDATE_CAPABILITY,
        ]),
        baseUrl: placeholderMockServer.baseUrl,
      });

      const result = await mockConnector.execute(
        {
          capability: HUBSPOT_DEAL_FETCH_CAPABILITY,
          businessTransactionId: "txn-placeholder-mock-ok",
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: "deals/1001",
          parameters: { dealId: "1001" },
        },
        context({
          credential: brandCredentialHandle({
            providerId: "static",
            credentialId: "hubspot",
            value: { privateAppToken: HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN },
          }),
        }),
      );

      expect(result.success).toBe(true);
    } finally {
      await placeholderMockServer.close();
    }
  });
});
