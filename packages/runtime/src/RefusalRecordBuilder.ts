import crypto from "node:crypto";

import {
  CryptoBootstrap,
  DEFAULT_KEY_ID,
  RefusalCrypto,
} from "@parmana/crypto";

import {
  Decision,
  RefusalRecord,
  type RefusalBindingViolation,
  type RefusalIntentSnapshot,
} from "@parmana/shared";

/**
 * Internal draft used during construction.
 */
type RefusalRecordDraft = Omit<
  RefusalRecord,
  "refusalRecordHash" | "signature"
>;

/**
 * Builds and signs the canonical Refusal Record (RFC-0021).
 *
 * Parallel to BusinessTrustRecordBuilder: builds a draft, hashes it,
 * signs it, returns the completed immutable record. Does not persist
 * anything — the caller (RuntimeEngine) owns the fail-open write
 * semantics RFC-0021 §6 requires.
 */
export class RefusalRecordBuilder {
  private readonly crypto = new RefusalCrypto();

  async build(
    businessTransactionId: string,
    decision: Decision,
    evaluatedIntent: RefusalIntentSnapshot,
    bindingViolations: readonly RefusalBindingViolation[] | undefined,
    submittedBy: string | undefined,
    policyContentHash?: string,
  ): Promise<RefusalRecord> {
    const now = new Date();

    const draft: RefusalRecordDraft = {
      refusalRecordId: crypto.randomUUID(),

      businessTransactionId,

      decision,

      evaluatedIntent,

      // exactOptionalPropertyTypes: omit the key entirely rather than
      // assign it `undefined` -- an absent bindingViolations means
      // "not a binding-violation REJECT," never a present-but-empty
      // marker.
      ...(bindingViolations && bindingViolations.length > 0
        ? { bindingViolations }
        : {}),

      ...(submittedBy !== undefined ? { submittedBy } : {}),
      ...(policyContentHash !== undefined ? { policyContentHash } : {}),

      createdAt: now,
    };

    //
    // Temporary Refusal Record for hashing.
    //
    const refusalRecord = {
      ...draft,

      refusalRecordHash: "",

      signature: {
        algorithm: CryptoBootstrap.create().signature.algorithm,

        keyId: DEFAULT_KEY_ID,

        value: "",

        signedAt: now,
      },
    };

    const refusalRecordHash = await this.crypto.hash(refusalRecord);

    const recordWithHash = {
      ...refusalRecord,

      refusalRecordHash,
    };

    const signature = await this.crypto.sign(recordWithHash);

    return {
      ...recordWithHash,

      signature,
    };
  }
}
