import type { SignatureEntry } from "@parmana/shared";

import { ArtifactSigner } from "./ArtifactSigner.js";
import { CanonicalSerializer } from "./CanonicalSerializer.js";
import type { KeyProvider } from "./KeyProvider.js";
import type { HybridCryptoProvider } from "./models/HybridCryptoProvider.js";
import { SignatureVerifier } from "./SignatureVerifier.js";

/**
 * Signs and verifies an artifact with two independent signature
 * algorithms at once (Hybrid Signature Support milestone, Phase A):
 * "harvest now, decrypt/forge later" defense for the classical-to-
 * post-quantum transition -- if a future quantum computer breaks the
 * primary (classical) algorithm, the secondary (post-quantum)
 * signature alone still holds, and vice versa if any weakness is ever
 * found in the newer PQ scheme.
 *
 * Not a SignatureProvider implementer: that interface signs/verifies
 * with exactly one key in, one signature out. Hybrid fundamentally
 * needs two keys and produces two independent signatures, so this is
 * a purpose-built composition on top of two SignatureProviders
 * (via HybridCryptoProvider) and a KeyProvider, mirroring how
 * VerificationCrypto/ReceiptCrypto already resolve keys by id rather
 * than requiring callers to pre-fetch raw KeyObjects.
 */
export class HybridSignatureProvider {
  constructor(
    private readonly crypto: HybridCryptoProvider,
    private readonly keys: KeyProvider,
    private readonly serializer = new CanonicalSerializer(),
  ) {}

  /**
   * Signs the artifact with both configured algorithms, returning
   * both entries in fixed [primary, secondary] order.
   */
  async sign(
    artifact: unknown,
    primaryKeyId: string,
    secondaryKeyId: string,
  ): Promise<readonly SignatureEntry[]> {
    const primarySigner = new ArtifactSigner(
      this.crypto.primary,
      this.serializer,
    );
    const secondarySigner = new ArtifactSigner(
      this.crypto.secondary,
      this.serializer,
    );

    const primaryPrivateKey = await this.keys.getPrivateKey(primaryKeyId);
    const secondaryPrivateKey = await this.keys.getPrivateKey(secondaryKeyId);

    const [primarySignature, secondarySignature] = await Promise.all([
      primarySigner.sign(artifact, primaryPrivateKey),
      secondarySigner.sign(artifact, secondaryPrivateKey),
    ]);

    return [
      {
        algorithm: this.crypto.primary.signature.algorithm,
        keyId: primaryKeyId,
        signature: primarySignature,
      },
      {
        algorithm: this.crypto.secondary.signature.algorithm,
        keyId: secondaryKeyId,
        signature: secondarySignature,
      },
    ];
  }

  /**
   * Verifies every entry in `signatures`. Fail-closed: requires
   * exactly one entry for the primary algorithm and one for the
   * secondary algorithm -- a missing, extra, duplicated, or
   * mismatched-algorithm entry is a rejection, never a partial pass.
   * Both entries must independently verify against their own
   * algorithm's public key (resolved by the entry's own keyId).
   *
   * Key lookup failures (missing/mismatched key material) are not
   * caught here and propagate as thrown errors, mirroring
   * VerificationCrypto.verifySignature()'s existing precedent: a
   * malformed *signature* is a verification failure (returns false);
   * missing *key infrastructure* is an operational error (throws).
   */
  async verify(
    artifact: unknown,
    signatures: readonly SignatureEntry[],
  ): Promise<boolean> {
    if (signatures.length !== 2) {
      return false;
    }

    const primaryEntry = signatures.find(
      (entry) => entry.algorithm === this.crypto.primary.signature.algorithm,
    );

    const secondaryEntry = signatures.find(
      (entry) => entry.algorithm === this.crypto.secondary.signature.algorithm,
    );

    if (!primaryEntry || !secondaryEntry || primaryEntry === secondaryEntry) {
      return false;
    }

    const primaryVerifier = new SignatureVerifier(
      this.crypto.primary,
      this.serializer,
    );
    const secondaryVerifier = new SignatureVerifier(
      this.crypto.secondary,
      this.serializer,
    );

    const primaryPublicKey = await this.keys.getPublicKey(primaryEntry.keyId);
    const secondaryPublicKey = await this.keys.getPublicKey(
      secondaryEntry.keyId,
    );

    const [primaryVerified, secondaryVerified] = await Promise.all([
      primaryVerifier.verify(
        artifact,
        primaryEntry.signature,
        primaryPublicKey,
      ),
      secondaryVerifier.verify(
        artifact,
        secondaryEntry.signature,
        secondaryPublicKey,
      ),
    ]);

    return primaryVerified && secondaryVerified;
  }
}
