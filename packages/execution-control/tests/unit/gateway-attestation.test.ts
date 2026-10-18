import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  GatewayAttestationSigner,
  SignedTokenConnectorAuthenticator,
  type Clock,
  type ConnectorIdentity,
  type GatewayIdentity,
  type IdGenerator,
} from "../../src/index.js";

class ManualClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }
}

class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `nonce-${this.counter}`;
  }
}

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const { privateKey: wrongPrivateKey } = generateKeyPairSync("ed25519");

  const gatewayIdentity: GatewayIdentity = {
    gatewayId: "gateway-1",
    publicIdentity: "spiffe://parmana/gateway",
    authenticationMetadata: {},
  };

  const connectorIdentity: ConnectorIdentity = {
    connectorId: "sap",
    publicIdentity: "spiffe://parmana/connectors/sap",
    authenticationMetadata: {},
  };

  const signer = new GatewayAttestationSigner(
    new ManualClock(new Date("2026-01-01T00:00:00Z")),
    new SequentialIdGenerator(),
  );

  const authenticator = new SignedTokenConnectorAuthenticator(
    gatewayIdentity,
    publicKey,
    [connectorIdentity],
  );

  return {
    privateKey,
    wrongPrivateKey,
    gatewayIdentity,
    connectorIdentity,
    signer,
    authenticator,
  };
}

describe("SignedTokenConnectorAuthenticator", () => {
  it("authenticates a validly signed attestation bound to the correct authorizationId", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      "authorization-1",
      f.privateKey,
    );

    expect(
      f.authenticator.authenticateGatewayForRequest(
        f.gatewayIdentity,
        attestation,
        "authorization-1",
      ),
    ).toBe(true);
  });

  it("rejects an attestation signed by the wrong key (spoofed gateway)", () => {
    const f = fixture();
    const forged = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      "authorization-1",
      f.wrongPrivateKey,
    );

    expect(
      f.authenticator.authenticateGatewayForRequest(
        f.gatewayIdentity,
        forged,
        "authorization-1",
      ),
    ).toBe(false);
  });

  it("rejects a tampered attestation payload", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      "authorization-1",
      f.privateKey,
    );
    const tampered = {
      ...attestation,
      payload: { ...attestation.payload, authorizationId: "authorization-2" },
    };

    expect(
      f.authenticator.authenticateGatewayForRequest(
        f.gatewayIdentity,
        tampered,
        "authorization-2",
      ),
    ).toBe(false);
  });

  it("rejects an attestation minted for a different authorizationId (replay across requests)", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      "authorization-1",
      f.privateKey,
    );

    expect(
      f.authenticator.authenticateGatewayForRequest(
        f.gatewayIdentity,
        attestation,
        "authorization-2",
      ),
    ).toBe(false);
  });

  it("rejects an undefined attestation (today's production default)", () => {
    const f = fixture();

    expect(
      f.authenticator.authenticateGatewayForRequest(
        f.gatewayIdentity,
        undefined,
        "authorization-1",
      ),
    ).toBe(false);
    expect(
      f.authenticator.authenticateGateway(f.gatewayIdentity, undefined),
    ).toBe(false);
  });

  it("authenticateGateway validates the signature without checking request binding", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      f.gatewayIdentity.gatewayId,
      "authorization-1",
      f.privateKey,
    );

    expect(
      f.authenticator.authenticateGateway(f.gatewayIdentity, attestation),
    ).toBe(true);
  });

  it("authenticates trusted connectors and rejects unknown ones", () => {
    const f = fixture();

    expect(f.authenticator.authenticateConnector(f.connectorIdentity)).toBe(
      true,
    );
    expect(
      f.authenticator.authenticateConnector({
        connectorId: "oracle",
        publicIdentity: "spiffe://parmana/connectors/oracle",
        authenticationMetadata: {},
      }),
    ).toBe(false);
  });
});
