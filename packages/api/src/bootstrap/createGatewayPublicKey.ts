import type { KeyObject } from "node:crypto";

import { DEFAULT_KEY_ID, SignerBootstrap, type Signer } from "@parmana/crypto";

/**
 * Loads the gateway verification public key.
 *
 * Resolves through SignerBootstrap (ADR-0009) -- LocalFileSigner or
 * KmsSigner depending on KEY_PROVIDER -- rather than reading
 * default.public.pem directly, so this call site (previously missed
 * by ADR-0009's own audit; it read the local key file unconditionally
 * regardless of KEY_PROVIDER, which crashed every request in
 * production the moment KEY_PROVIDER=aws-kms was set, since no local
 * key directory is materialized for that provider) behaves the same
 * as every other signing/verification call site in this codebase.
 *
 * Accepts an optional pre-resolved `signer`: createExecutionGateway.ts
 * shares one Signer instance between this function and its
 * SignerKeyProviderAdapter (see that file), so signing and
 * per-authorization verification are guaranteed to resolve through the
 * identical backend -- not two independently-constructed Signers that
 * happen to usually agree.
 */
export async function createGatewayPublicKey(
  signer?: Signer,
): Promise<KeyObject> {
  const resolvedSigner = signer ?? (await SignerBootstrap.create());

  return resolvedSigner.getPublicKey(DEFAULT_KEY_ID);
}
