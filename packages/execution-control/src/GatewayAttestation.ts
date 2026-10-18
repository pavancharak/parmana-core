import { sign, verify, type KeyObject } from "node:crypto";

import { CanonicalSerializer } from "@parmana/crypto";

import type { Clock } from "./Clock.js";
import type { IdGenerator } from "./IdGenerator.js";

const serializer = new CanonicalSerializer();

/**
 * Payload the Gateway signs to prove it possesses the Gateway's private
 * key. authorizationId binds the attestation to one specific request so
 * it cannot be replayed to authenticate a DIFFERENT request.
 *
 * nonce is an entropy/uniqueness field only — nothing in this file or in
 * SignedTokenConnectorAuthenticator records consumed nonces, so it is not
 * itself a replay defense. It exists so two attestations minted for the
 * same authorizationId (e.g. a retried call) are distinguishable, and so
 * the signed payload isn't otherwise fully deterministic from
 * (gatewayId, authorizationId, issuedAt) alone. Replay of the SAME
 * attestation against the SAME request is prevented elsewhere: the
 * single-use GatewaySession (InMemoryGatewaySessionStore, existing,
 * unmodified) rejects a second execution attempt once a session has been
 * consumed, and replay of the underlying SignedExecutionAuthorization
 * itself is the responsibility of @parmana/envelope-verifier's NonceStore,
 * upstream of everything in this package. If this attestation's nonce
 * needs to independently defend against replay in the future, a consumer
 * would need to track seen (gatewayId, nonce) pairs — nothing here does.
 */
export interface GatewayAttestationPayload {
  readonly gatewayId: string;
  readonly authorizationId: string;
  readonly nonce: string;
  readonly issuedAt: string;
}

export interface GatewayAttestation {
  readonly payload: GatewayAttestationPayload;
  readonly signature: string;
}

/**
 * Mints signed Gateway attestations using the same Ed25519 sign()
 * primitive as Ed25519SignatureProvider (packages/crypto), called
 * directly rather than through @parmana/crypto's async wrapper because
 * ConnectorAuthenticator.authenticateGateway() is a synchronous
 * interface — binding.ts in this same package calls node:crypto
 * directly for the same reason.
 */
export class GatewayAttestationSigner {
  constructor(
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  sign(
    gatewayId: string,
    authorizationId: string,
    privateKey: KeyObject,
  ): GatewayAttestation {
    const payload: GatewayAttestationPayload = Object.freeze({
      gatewayId,
      authorizationId,
      nonce: this.idGenerator.generate(),
      issuedAt: this.clock.now().toISOString(),
    });

    const signature = sign(
      null,
      serializer.serialize(payload),
      privateKey,
    ).toString("base64");

    return Object.freeze({ payload, signature });
  }
}

export function isGatewayAttestation(
  value: unknown,
): value is GatewayAttestation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GatewayAttestation>;
  if (typeof candidate.signature !== "string") return false;
  if (typeof candidate.payload !== "object" || candidate.payload === null)
    return false;
  const payload = candidate.payload as Partial<GatewayAttestationPayload>;
  return (
    typeof payload.gatewayId === "string" &&
    typeof payload.authorizationId === "string" &&
    typeof payload.nonce === "string" &&
    typeof payload.issuedAt === "string"
  );
}

export function verifyGatewayAttestationSignature(
  attestation: GatewayAttestation,
  publicKey: KeyObject,
): boolean {
  return verify(
    null,
    serializer.serialize(attestation.payload),
    publicKey,
    Buffer.from(attestation.signature, "base64"),
  );
}
