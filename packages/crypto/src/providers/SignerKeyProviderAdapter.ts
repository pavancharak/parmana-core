import type { KeyObject } from "node:crypto";

import type { KeyMetadata, KeyProvider } from "../KeyProvider.js";
import type { Signer } from "../Signer.js";
import { CryptoError } from "../errors/CryptoError.js";

/**
 * Adapts a Signer (ADR-0009's sign-without-release abstraction) to the
 * read-only surface of KeyProvider, for call sites that were written
 * against KeyProvider before Signer existed and only ever use its read
 * operations (getPublicKey/getMetadata/hasKey/listKeys) -- never
 * getPrivateKey.
 *
 * Root cause this exists to fix (found 2026-09-16, live production
 * traffic): EnvelopeVerifier.resolveKey() uses `keyProvider` -- when
 * supplied at all -- for EVERY authorization it verifies, including
 * ones signed under the plain "default" keyId, not only tenant-scoped
 * ones (contrary to this codebase's own earlier assessment the night
 * before, in createExecutionGateway.ts's "KNOWN GAP" comment, that this
 * path was "currently inert" -- it was not). createExecutionGateway.ts
 * unconditionally passed `new FileKeyProvider()` as that keyProvider
 * regardless of KEY_PROVIDER, so under KEY_PROVIDER=aws-kms, every
 * authorization -- signed by the real KMS key via SignerBootstrap --
 * was verified against whatever STALE local default.public.pem
 * happened to still be materialized from PARMANA_KEY_MATERIAL_JSON's
 * pre-KMS-migration entry. Signing key and verifying key silently
 * diverged, failing signatureVerified (and everything that cascades
 * from it: businessTransactionHashMatches, nonceUnseen) on every real
 * request. Passing a SignerKeyProviderAdapter wrapping the SAME Signer
 * createGatewayPublicKey() already uses closes that divergence: signing
 * and per-authorization verification now resolve through the identical
 * KMS-backed (or local-file-backed, under KEY_PROVIDER=local) source.
 */
export class SignerKeyProviderAdapter implements KeyProvider {
  constructor(private readonly signer: Signer) {}

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    return this.signer.getMetadata(keyId);
  }

  async getPublicKey(keyId: string): Promise<KeyObject> {
    return this.signer.getPublicKey(keyId);
  }

  /**
   * Always throws: a Signer never releases private key material (that
   * is the entire point of ADR-0009 for KmsSigner specifically), so
   * this cannot be honestly implemented. Loud and immediate, not a
   * silent no-op, so a call site that actually needed private key
   * material (this adapter is for verification-only consumers) fails
   * fast during development rather than misbehaving quietly in
   * production -- the same "fail fast on a missed call site" precedent
   * KmsSigner.sign()'s own design note sets for the reverse direction.
   */
  async getPrivateKey(): Promise<KeyObject> {
    throw new CryptoError(
      "SignerKeyProviderAdapter does not expose private key material -- " +
        "it wraps a Signer (sign-without-release), which never releases a " +
        "private key by design. A caller that needs to sign should depend " +
        "on Signer directly, not KeyProvider.getPrivateKey().",
    );
  }

  async hasKey(keyId: string): Promise<boolean> {
    return this.signer.hasKey(keyId);
  }

  async listKeys(): Promise<string[]> {
    if (!this.signer.listKeys) {
      throw new CryptoError(
        "The underlying Signer does not support listKeys().",
      );
    }

    return this.signer.listKeys();
  }
}
