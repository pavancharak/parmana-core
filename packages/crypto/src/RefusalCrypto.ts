import type { RefusalRecord, Signature } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { SignatureVerifier } from "./SignatureVerifier.js";
import { SignerBootstrap } from "./SignerBootstrap.js";
import { currentVerificationKeyId } from "./KeyProvider.js";

/**
 * Refusal cryptographic operations (RFC-0021).
 *
 * Parallel to VerificationCrypto, over Refusal Records instead of
 * Execution Trust Records. Deliberately reuses the exact same
 * signing stack and DEFAULT_KEY_ID as VerificationCrypto — RFC-0021
 * §2's resolved decision is one root of trust for both approvals and
 * refusals, not a second key to manage.
 */
export class RefusalCrypto {
  private readonly crypto = CryptoBootstrap.create();

  private readonly signerPromise = SignerBootstrap.create();

  private readonly hasher = new TrustRecordHasher(this.crypto);

  private readonly signer = new ArtifactSigner(this.crypto);

  private readonly verifier = new SignatureVerifier(this.crypto);

  /**
   * Creates the canonical immutable view of a Refusal Record used
   * for hashing and signing. Excludes the signature itself.
   */
  private canonicalRecord(refusalRecord: RefusalRecord) {
    return {
      refusalRecordId: refusalRecord.refusalRecordId,

      businessTransactionId: refusalRecord.businessTransactionId,

      decision: refusalRecord.decision,

      evaluatedIntent: refusalRecord.evaluatedIntent,

      bindingViolations: refusalRecord.bindingViolations,

      submittedBy: refusalRecord.submittedBy,

      // Absent on records written before it existed; an absent key is
      // left out of the canonical form, so those records still verify.
      policyContentHash: refusalRecord.policyContentHash,

      createdAt: refusalRecord.createdAt,
    };
  }

  /**
   * Computes the canonical Refusal Record hash.
   */
  async hash(refusalRecord: RefusalRecord): Promise<string> {
    return this.hasher.hash(this.canonicalRecord(refusalRecord));
  }

  /**
   * Creates a digital signature over the canonical Refusal Record.
   */
  async sign(refusalRecord: RefusalRecord): Promise<Signature> {
    const keyId = currentVerificationKeyId();

    const signer = await this.signerPromise;

    const value = await this.signer.signWithSigner(
      this.canonicalRecord(refusalRecord),
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

  /**
   * Verifies integrity and authenticity of a Refusal Record.
   */
  async verify(refusalRecord: RefusalRecord): Promise<boolean> {
    const expectedHash = await this.hash(refusalRecord);

    if (expectedHash !== refusalRecord.refusalRecordHash) {
      return false;
    }

    const signer = await this.signerPromise;

    const publicKey = await signer.getPublicKey(refusalRecord.signature.keyId);

    return this.verifier.verify(
      this.canonicalRecord(refusalRecord),
      refusalRecord.signature.value,
      publicKey,
    );
  }
}
