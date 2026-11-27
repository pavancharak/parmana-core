import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  SignedTokenConnectorAuthenticator,
  externalConnectorIdentity,
} from "../../src/index.js";

const gateway = {
  gatewayId: "g",
  publicIdentity: "spiffe://parmana/gateway",
  authenticationMetadata: {},
};

describe("external connector identity", () => {
  it("names the capability in both fields", () => {
    expect(externalConnectorIdentity("erp:create-invoice")).toEqual({
      connectorId: "ext-erp:create-invoice",
      publicIdentity: "spiffe://parmana/connectors/external/erp:create-invoice",
      authenticationMetadata: {},
    });
  });

  it("is trusted by an authenticator scoped to it, and by no other", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const invoice = externalConnectorIdentity("erp:create-invoice");
    const voidInvoice = externalConnectorIdentity("erp:void-invoice");
    const shared = new SignedTokenConnectorAuthenticator(
      gateway,
      publicKey,
      [],
    );

    // The shared authenticator trusts no external connector by its form.
    expect(shared.authenticateConnector(invoice)).toBe(false);

    const scoped = shared.scopedTo([invoice]);
    expect(scoped.authenticateConnector(invoice)).toBe(true);

    // Same form, different capability: refused. This is the case a
    // format-only check accepted.
    expect(scoped.authenticateConnector(voidInvoice)).toBe(false);
  });

  it("keeps the gateway trust of the authenticator it was scoped from", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const invoice = externalConnectorIdentity("erp:create-invoice");
    const scoped = new SignedTokenConnectorAuthenticator(
      gateway,
      publicKey,
      [],
    ).scopedTo([invoice]);

    expect(scoped.authenticateGateway(gateway, undefined)).toBe(false);
  });
});
