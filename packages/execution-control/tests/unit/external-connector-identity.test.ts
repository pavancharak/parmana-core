import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  SignedTokenConnectorAuthenticator,
  externalConnectorIdentity,
  isExternalConnectorIdentity,
} from "../../src/index.js";

/**
 * External connectors (ADR-0013) are built by the server at request
 * time, so the authenticator trusts their identity form, not a list.
 */
describe("external connector identity", () => {
  it("names the capability in both fields", () => {
    expect(externalConnectorIdentity("erp:create-invoice")).toEqual({
      connectorId: "ext-erp:create-invoice",
      publicIdentity: "spiffe://parmana/connectors/external/erp:create-invoice",
      authenticationMetadata: {},
    });
  });

  it("accepts only that form, with the same capability in both fields", () => {
    expect(
      isExternalConnectorIdentity(
        externalConnectorIdentity("erp:create-invoice"),
      ),
    ).toBe(true);

    for (const identity of [
      {
        connectorId: "ext-erp:create-invoice",
        publicIdentity: "spiffe://parmana/connectors/external/erp:void-invoice",
      },
      {
        connectorId: "paytm",
        publicIdentity: "spiffe://parmana/connectors/external/paytm",
      },
      {
        connectorId: "ext-",
        publicIdentity: "spiffe://parmana/connectors/external/",
      },
      {
        connectorId: "ext-erp:create-invoice",
        publicIdentity: "spiffe://parmana/connectors/paytm-refund",
      },
    ]) {
      expect(
        isExternalConnectorIdentity({
          ...identity,
          authenticationMetadata: {},
        }),
      ).toBe(false);
    }
  });

  it("is trusted by the authenticator only when it is told to trust external connectors", () => {
    const gateway = {
      gatewayId: "g",
      publicIdentity: "spiffe://parmana/gateway",
      authenticationMetadata: {},
    };
    const { publicKey } = generateKeyPairSync("ed25519");
    const identity = externalConnectorIdentity("erp:create-invoice");

    expect(
      new SignedTokenConnectorAuthenticator(
        gateway,
        publicKey,
        [],
      ).authenticateConnector(identity),
    ).toBe(false);
    expect(
      new SignedTokenConnectorAuthenticator(
        gateway,
        publicKey,
        [],
        true,
      ).authenticateConnector(identity),
    ).toBe(true);
  });
});
