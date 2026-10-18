import type { PolicyChangeApprovalRecord, Signature } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { SignatureVerifier } from "./SignatureVerifier.js";
import { SignerBootstrap } from "./SignerBootstrap.js";
import { DEFAULT_KEY_ID } from "./KeyProvider.js";

/**
 * Policy Change cryptographic operations (Policy Governance,
 * maker-checker).
 *
 * Parallel to RefusalCrypto, over PolicyChangeApprovalRecord instead
 * of RefusalRecord. Deliberately reuses the exact same signing stack
 * and DEFAULT_KEY_ID as VerificationCrypto/RefusalCrypto -- see
 * PolicyChangeApprovalRecord's own doc comment: this is the same
 * trust root approvals and refusals already share, not a third key
 * to manage.
 */
export class PolicyChangeCrypto {
  private readonly crypto = CryptoBootstrap.create();

  private readonly signerPromise = SignerBootstrap.create();

  private readonly hasher = new TrustRecordHasher(this.crypto);

  private readonly signer = new ArtifactSigner(this.crypto);

  private readonly verifier = new SignatureVerifier(this.crypto);

  /**
   * Creates the canonical immutable view of a Policy Change Approval
   * Record used for signing/verification. Excludes the signature
   * itself.
   */
  private canonicalRecord(record: PolicyChangeApprovalRecord) {
    return {
      policyChangeApprovalRecordId: record.policyChangeApprovalRecordId,

      pendingPolicyChangeId: record.pendingPolicyChangeId,

      policyName: record.policyName,

      policyVersion: record.policyVersion,

      proposedBy: record.proposedBy,

      approvedBy: record.approvedBy,

      proposedAt: record.proposedAt,

      approvedAt: record.approvedAt,

      contentHashBefore: record.contentHashBefore,

      contentHashAfter: record.contentHashAfter,

      previousRecordHash: record.previousRecordHash,
    };
  }

  /**
   * Hashes arbitrary canonicalized policy content -- the same
   * canonicalization and hash algorithm as every other artifact hash
   * in this codebase, used for PolicyChangeApprovalRecord's
   * contentHashBefore/contentHashAfter (the canonicalized policy.json
   * content immediately before/after an approval, not the approval
   * record itself).
   */
  async hashPolicyContent(content: unknown): Promise<string> {
    return this.hasher.hash(content);
  }

  /**
   * Creates a digital signature over the canonical Policy Change
   * Approval Record.
   */
  async sign(record: PolicyChangeApprovalRecord): Promise<Signature> {
    const keyId = DEFAULT_KEY_ID;

    const signer = await this.signerPromise;

    const value = await this.signer.signWithSigner(
      this.canonicalRecord(record),
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
   * Verifies the signature of a Policy Change Approval Record.
   */
  async verify(record: PolicyChangeApprovalRecord): Promise<boolean> {
    const signer = await this.signerPromise;

    const publicKey = await signer.getPublicKey(record.signature.keyId);

    return this.verifier.verify(
      this.canonicalRecord(record),
      record.signature.value,
      publicKey,
    );
  }
}
