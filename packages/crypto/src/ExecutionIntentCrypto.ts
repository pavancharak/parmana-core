import type { ExecutionIntent, Signature } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import { canonicalExecutionIntent } from "./ExecutionIntentCanonicalView.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { SignatureVerifier } from "./SignatureVerifier.js";
import { SignerBootstrap } from "./SignerBootstrap.js";
import { currentVerificationKeyId } from "./KeyProvider.js";

/**
 * Hashes, signs and verifies an Execution Intent (ADR-0012).
 *
 * Same construction as RefusalCrypto: the signature covers a canonical
 * projection of the intent that excludes `intentHash` and `signature`, it is
 * made with the deployment's signing key (local or AWS KMS), and it verifies
 * against the public key alone, so a third party can check an intent without
 * access to the database.
 */
export class ExecutionIntentCrypto {
  private readonly crypto = CryptoBootstrap.create();

  private readonly signerPromise = SignerBootstrap.create();

  private readonly hasher = new TrustRecordHasher(this.crypto);

  private readonly signer = new ArtifactSigner(this.crypto);

  private readonly verifier = new SignatureVerifier(this.crypto);

  async hash(intent: ExecutionIntent): Promise<string> {
    return this.hasher.hash(canonicalExecutionIntent(intent));
  }

  async sign(intent: ExecutionIntent): Promise<Signature> {
    const keyId = currentVerificationKeyId();

    const signer = await this.signerPromise;

    const value = await this.signer.signWithSigner(
      canonicalExecutionIntent(intent),
      keyId,
      signer,
    );

    return {
      algorithm: this.crypto.signature.algorithm,

      keyId,

      value,

      signedAt: new Date(),
    };
  }

  async verify(intent: ExecutionIntent): Promise<boolean> {
    const expectedHash = await this.hash(intent);

    if (expectedHash !== intent.intentHash) {
      return false;
    }

    const signer = await this.signerPromise;

    const publicKey = await signer.getPublicKey(intent.signature.keyId);

    return this.verifier.verify(
      canonicalExecutionIntent(intent),
      intent.signature.value,
      publicKey,
    );
  }
}
