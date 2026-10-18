import { generateKeyPairSync } from "node:crypto";

import {
  GatewayAttestationSigner,
  SignedTokenConnectorAuthenticator,
  type Clock,
  type ConnectorIdentity,
  type GatewayIdentity,
  type IdGenerator,
} from "@parmana/execution-control";

//
// Tutorial 59 shows GatewayAttestationSigner and
// SignedTokenConnectorAuthenticator as one piece of a full
// SecureConnector flow (genuine attestation, a spoofed-key forgery,
// and a replay against a different authorizationId). This tutorial
// exercises the authenticator's own remaining surface directly: a
// tampered PAYLOAD carrying its original (now-mismatched) signature,
// the production default for a missing attestation, the distinction
// between checking a signature alone versus checking it AND its
// request binding, and the separate trusted-connector-identity check.
//
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

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

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
  new ManualClock(new Date()),
  new SequentialIdGenerator(),
);
const authenticator = new SignedTokenConnectorAuthenticator(
  gatewayIdentity,
  publicKey,
  [connectorIdentity],
);

console.log();
console.log("==================================================");
console.log("Tutorial 86 - Gateway Attestation");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1: A tampered payload, still carrying its original (now-mismatched) signature",
);
console.log("--------------------------------------------------");
const genuine = signer.sign(
  gatewayIdentity.gatewayId,
  "authorization-1",
  privateKey,
);
const tampered = {
  ...genuine,
  payload: { ...genuine.payload, authorizationId: "authorization-2" },
};
const tamperedResult = authenticator.authenticateGatewayForRequest(
  gatewayIdentity,
  tampered,
  "authorization-2",
);
console.log(
  `Rewriting authorizationId post-signing, then checking against the NEW value -> accepted: ${tamperedResult}`,
);
console.log(
  "(The signature was computed over the original payload -- rewriting any field breaks it, even the field being checked against.)",
);
console.log();

console.log(
  "Scenario 2: No attestation presented at all (today's production default)",
);
console.log("--------------------------------------------------");
const undefinedForRequest = authenticator.authenticateGatewayForRequest(
  gatewayIdentity,
  undefined,
  "authorization-1",
);
const undefinedGeneral = authenticator.authenticateGateway(
  gatewayIdentity,
  undefined,
);
console.log(
  `authenticateGatewayForRequest(undefined) -> accepted: ${undefinedForRequest}`,
);
console.log(
  `authenticateGateway(undefined)            -> accepted: ${undefinedGeneral}`,
);
console.log();

console.log(
  "Scenario 3: Signature-only check vs. signature-AND-request-binding check",
);
console.log("--------------------------------------------------");
const signatureOnly = authenticator.authenticateGateway(
  gatewayIdentity,
  genuine,
);
const wrongBinding = authenticator.authenticateGatewayForRequest(
  gatewayIdentity,
  genuine,
  "authorization-999",
);
console.log(
  `authenticateGateway(genuine)                                    -> accepted: ${signatureOnly} (signature alone is valid)`,
);
console.log(
  `authenticateGatewayForRequest(genuine, "authorization-999")     -> accepted: ${wrongBinding} (but it was never minted for THIS request)`,
);
console.log();

console.log("Scenario 4: Trusted vs. unknown connector identity");
console.log("--------------------------------------------------");
const trustedConnector = authenticator.authenticateConnector(connectorIdentity);
const unknownConnector = authenticator.authenticateConnector({
  connectorId: "oracle",
  publicIdentity: "spiffe://parmana/connectors/oracle",
  authenticationMetadata: {},
});
console.log(
  `authenticateConnector("sap")    -> accepted: ${trustedConnector} (registered at authenticator construction)`,
);
console.log(
  `authenticateConnector("oracle") -> accepted: ${unknownConnector} (never registered)`,
);
console.log();

const allPassed =
  tamperedResult === false &&
  undefinedForRequest === false &&
  undefinedGeneral === false &&
  signatureOnly === true &&
  wrongBinding === false &&
  trustedConnector === true &&
  unknownConnector === false;

if (allPassed) {
  console.log(
    "✓ Tampering, missing attestations, and unbound/untrusted identities are all rejected; only a genuine, correctly-bound, pre-registered identity passes.",
  );
} else {
  console.log(
    "✗ Expected every scenario above to match SignedTokenConnectorAuthenticator's documented behavior.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 87 - Key Provider Path Traversal");
