import { loadConfig } from "@parmana/shared";
import type {
  ExecutionTrustRecord,
  Signature,
  SignatureEntry,
} from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import {
  canonicalExecutionTrustRecord,
  hybridCanonicalExecutionTrustRecord,
} from "./ExecutionTrustRecordCanonicalView.js";
import { HybridSignatureProvider } from "./HybridSignatureProvider.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { SignatureVerifier } from "./SignatureVerifier.js";
import { SignerBootstrap } from "./SignerBootstrap.js";
import { FileKeyProvider } from "./providers/key/FileKeyProvider.js";
import {
  currentVerificationKeyId,
  currentVerificationSecondaryKeyId,
} from "./KeyProvider.js";

/**
 * Schema version stamped on `signatures`-bearing records produced by
 * this class. Bumped from the implicit v1 (no `schemaVersion` field
 * at all -- today's shape) the moment a second, independent signature
 * is added alongside the legacy one (Hybrid Signature Support
 * milestone, Phase A).
 */
const HYBRID_SCHEMA_VERSION = 2;

/**
 * Verification cryptographic operations.
 *
 * Provides hashing, signing and verification
 * services for Execution Trust Records.
 */
export class VerificationCrypto {
  private readonly crypto = CryptoBootstrap.create();

  private readonly config = loadConfig();

  /**
   * Signer (ADR-0009) -- LocalFileSigner or KmsSigner depending on
   * KEY_PROVIDER. Used for both signing (sign()) and verification
   * (verifySignature()/verify()), since Signer's read operations
   * (getPublicKey/getMetadata/hasKey) are identical to KeyProvider's.
   */
  private readonly signerPromise = SignerBootstrap.create();

  /**
   * Hybrid mode is out of scope for the Signer migration (ADR-0009):
   * it needs a second, independent key/algorithm pair, and KmsSigner
   * today only supports Ed25519. HybridSignatureProvider keeps using
   * FileKeyProvider directly for BOTH entries of the `signatures`
   * array, the Ed25519 one included, so CRYPTO_MODE=hybrid is
   * local-file-only. assertSigningKeyMaterialConfigured (packages/api)
   * refuses CRYPTO_MODE=hybrid with KEY_PROVIDER=aws-kms at startup.
   * CRYPTO_MODE defaults to "single", so this does not affect a
   * deployment that hasn't opted into hybrid.
   */
  private readonly hybridKeys = new FileKeyProvider();

  private readonly hasher = new TrustRecordHasher(this.crypto);

  private readonly signer = new ArtifactSigner(this.crypto);

  private readonly verifier = new SignatureVerifier(this.crypto);

  /**
   * Creates the canonical immutable view of an Execution Trust Record
   * used for hashing and signing.
   *
   * Delegates to canonicalExecutionTrustRecord() (own file, PQC audit
   * RED-1) -- the same mapping OfflineVerifier.ts uses -- rather than
   * duplicating the field list here, so there is exactly one place
   * that defines "which fields participate in the signature."
   * Unchanged behavior; see that function's own doc comment for the
   * full field-by-field reasoning (authorization inclusion,
   * CanonicalSerializer's undefined-key-dropping compatibility, etc.).
   */
  private canonicalRecord(trustRecord: ExecutionTrustRecord) {
    return canonicalExecutionTrustRecord(trustRecord);
  }

  /**
   * Canonical view signed/verified by the hybrid `signatures` array.
   * Delegates to hybridCanonicalExecutionTrustRecord() for the same
   * single-source-of-truth reason as canonicalRecord() above.
   */
  private hybridCanonicalRecord(
    trustRecord: ExecutionTrustRecord,
    schemaVersion: number,
  ) {
    return hybridCanonicalExecutionTrustRecord(trustRecord, schemaVersion);
  }

  private hybridSignatureProvider(): HybridSignatureProvider {
    return new HybridSignatureProvider(
      CryptoBootstrap.createHybrid(),
      this.hybridKeys,
    );
  }

  /**
   * Computes the canonical Trust Record hash.
   */
  async hash(trustRecord: ExecutionTrustRecord): Promise<string> {
    return this.hasher.hash(this.canonicalRecord(trustRecord));
  }

  /**
   * Creates a digital signature over the canonical
   * Trust Record.
   *
   * Unchanged by hybrid mode: always the single, legacy signature,
   * over exactly the same content as before this milestone. See
   * signHybrid() for the additive second signature.
   */
  async sign(trustRecord: ExecutionTrustRecord): Promise<Signature> {
    const keyId = currentVerificationKeyId();

    const signer = await this.signerPromise;

    const value = await this.signer.signWithSigner(
      this.canonicalRecord(trustRecord),
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
   * Signing readiness probe (docs/VERIFICATION-GAPS.md G-52).
   *
   * Proves, before an action is released, that the evidence signing path
   * can currently produce a signature that verifies. It signs a synthetic
   * artifact through the SAME Signer and key id sign() uses for Execution
   * Trust Records, then verifies it against the public key the same
   * Signer publishes, so it catches a missing, disabled or access denied
   * key, a KMS or network outage, a signing and verification key
   * mismatch, and the KMS raw message size limit. The artifact is padded
   * past 4096 bytes on purpose, so the large message path (ADR-0010) is
   * exercised, not only the small one. Throws on any failure and returns
   * nothing on success. It signs nothing that is stored or trusted.
   */
  async probeSigning(): Promise<void> {
    const keyId = currentVerificationKeyId();

    const signer = await this.signerPromise;

    const probe = {
      purpose: "parmana-signing-readiness-probe",
      padding: "x".repeat(6000),
    };

    const value = await this.signer.signWithSigner(probe, keyId, signer);

    const publicKey = await signer.getPublicKey(keyId);

    const verified = await this.verifier.verify(probe, value, publicKey);

    if (!verified) {
      throw new Error(
        `Signing readiness probe signature did not verify against the ` +
          `published public key for key "${keyId}".`,
      );
    }
  }

  /**
   * Signs the Trust Record with both configured algorithms
   * (Hybrid Signature Support milestone, Phase A). Additive:
   * callers combine this with the unchanged sign() above -- the
   * legacy `signature` field is untouched, `signatures` is new.
   *
   * Fails closed: throws if CRYPTO_MODE is not "hybrid", or if
   * SECONDARY_SIGNATURE_PROVIDER isn't configured (via
   * CryptoBootstrap.createHybrid()'s own guard), or if either key
   * file is missing (via FileKeyProvider's own guard) -- never a
   * silent partial signature.
   */
  async signHybrid(
    trustRecord: ExecutionTrustRecord,
  ): Promise<readonly SignatureEntry[]> {
    if (this.config.crypto.mode !== "hybrid") {
      throw new Error(
        "VerificationCrypto.signHybrid() requires CRYPTO_MODE=hybrid.",
      );
    }

    return this.hybridSignatureProvider().sign(
      this.hybridCanonicalRecord(trustRecord, HYBRID_SCHEMA_VERSION),
      currentVerificationKeyId(),
      currentVerificationSecondaryKeyId(),
    );
  }

  /**
   * Verifies only the cryptographic signature(s) of the Trust
   * Record, independent of hash comparison.
   *
   * The legacy `signature` field is always checked (unchanged
   * behavior). If `signatures` is also present and non-empty, it is
   * independently and fully verified too -- both must pass. A
   * `signatures`-bearing record with a missing or malformed entry
   * fails here even if the legacy `signature` alone is valid: never a
   * silent downgrade to single-signature verification.
   *
   * PQC audit RED-4 (docs/VERIFICATION-GAPS.md): by itself, the
   * paragraph above only protects a record that still *carries* its
   * `signatures` array -- nothing stopped `signatures` from being
   * stripped entirely, at which point this method fell back to
   * `legacyVerified` alone and reported a fully hybrid-signed record
   * as valid via its now-lone classical signature. That silently
   * defeats hybrid mode's entire purpose (a future break of the
   * classical algorithm no longer has a surviving PQ signature to
   * fall back on), and required no key material to pull off -- only
   * write/storage access to a copy of the record. `requireHybridSignature`
   * closes this for any deployment that opts in: when set, a missing
   * or empty `signatures` array is a rejection, not a silent
   * single-signature pass. Off by default, so enabling CRYPTO_MODE=
   * hybrid never retroactively invalidates a record issued before a
   * deployment decided every future record must be hybrid-signed.
   *
   * Reuses the same canonical view and verifier as verify(), so
   * callers that need to report integrity and signature failures
   * independently don't have to reimplement canonicalization.
   */
  async verifySignature(trustRecord: ExecutionTrustRecord): Promise<boolean> {
    const signer = await this.signerPromise;

    const publicKey = await signer.getPublicKey(trustRecord.signature.keyId);

    const legacyVerified = await this.verifier.verify(
      this.canonicalRecord(trustRecord),
      trustRecord.signature.value,
      publicKey,
    );

    if (
      trustRecord.signatures === undefined ||
      trustRecord.signatures.length === 0
    ) {
      if (this.config.crypto.requireHybridSignature) {
        return false;
      }

      return legacyVerified;
    }

    const hybridVerified = await this.hybridSignatureProvider().verify(
      this.hybridCanonicalRecord(
        trustRecord,
        trustRecord.schemaVersion ?? HYBRID_SCHEMA_VERSION,
      ),
      trustRecord.signatures,
    );

    return legacyVerified && hybridVerified;
  }

  /**
   * Verifies integrity and authenticity of the
   * Trust Record.
   */
  async verify(trustRecord: ExecutionTrustRecord): Promise<boolean> {
    //
    // Verify hash integrity.
    //
    const expectedHash = await this.hash(trustRecord);

    if (expectedHash !== trustRecord.trustRecordHash) {
      return false;
    }

    //
    // Verify signature(s) -- legacy always, hybrid additionally
    // when the record declares itself hybrid-signed.
    //
    return this.verifySignature(trustRecord);
  }
}
