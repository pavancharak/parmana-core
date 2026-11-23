import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  GATEWAY_ATTESTATION_TTL_MS,
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

  set(next: Date): void {
    this.current = next;
  }
}

class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `nonce-${this.counter}`;
  }
}

const ISSUED_AT = "2026-01-01T00:00:00Z";

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const clock = new ManualClock(new Date(ISSUED_AT));
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
    clock,
    new SequentialIdGenerator(),
  );

  const authenticator = new SignedTokenConnectorAuthenticator(
    gatewayIdentity,
    publicKey,
    [connectorIdentity],
    false,
    clock,
  );

  return {
    privateKey,
    wrongPrivateKey,
    gatewayIdentity,
    connectorIdentity,
    signer,
    authenticator,
    clock,
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

describe("gateway attestation expiry (Gap A)", () => {
  it("accepts an attestation inside its lifetime", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      "gateway-1",
      "authorization-1",
      f.privateKey,
    );

    f.clock.set(
      new Date(Date.parse(ISSUED_AT) + GATEWAY_ATTESTATION_TTL_MS - 1),
    );

    expect(
      f.authenticator.authenticateGatewayForRequest(
        f.gatewayIdentity,
        attestation,
        "authorization-1",
      ),
    ).toBe(true);
  });

  it("refuses an attestation at exactly its expiry instant", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      "gateway-1",
      "authorization-1",
      f.privateKey,
    );

    f.clock.set(new Date(Date.parse(ISSUED_AT) + GATEWAY_ATTESTATION_TTL_MS));

    expect(
      f.authenticator.authenticateGateway(f.gatewayIdentity, attestation),
    ).toBe(false);
  });

  it("refuses an attestation long after it was issued, with no grace period", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      "gateway-1",
      "authorization-1",
      f.privateKey,
    );

    f.clock.set(new Date("2027-01-01T00:00:00Z"));

    expect(
      f.authenticator.authenticateGatewayForRequest(
        f.gatewayIdentity,
        attestation,
        "authorization-1",
      ),
    ).toBe(false);
  });

  it("refuses an attestation whose expiry was pushed forward after signing", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      "gateway-1",
      "authorization-1",
      f.privateKey,
    );
    const extended = {
      ...attestation,
      payload: {
        ...attestation.payload,
        expiresAt: new Date(Date.parse(ISSUED_AT) + 10 * 60_000).toISOString(),
      },
    };

    f.clock.set(new Date(Date.parse(ISSUED_AT) + 5 * 60_000));

    expect(
      f.authenticator.authenticateGateway(f.gatewayIdentity, extended),
    ).toBe(false);
  });

  it("refuses an attestation with no parseable expiry", () => {
    const f = fixture();
    const attestation = f.signer.sign(
      "gateway-1",
      "authorization-1",
      f.privateKey,
    );
    const broken = {
      ...attestation,
      payload: { ...attestation.payload, expiresAt: "not-a-date" },
    };

    expect(f.authenticator.authenticateGateway(f.gatewayIdentity, broken)).toBe(
      false,
    );
  });
});
