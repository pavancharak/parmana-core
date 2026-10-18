import type { Execution, Signature } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";
import { ExecutionChainHasher } from "./ExecutionChainHasher.js";
import { ArtifactSigner } from "./ArtifactSigner.js";
import { SignatureVerifier } from "./SignatureVerifier.js";
import { SignerBootstrap } from "./SignerBootstrap.js";
import { DEFAULT_KEY_ID } from "./KeyProvider.js";

/**
 * Result of computing one Execution's chain fields.
 */
export interface ExecutionChainFields {
  readonly previousChainHash: string | null;
  readonly chainHash: string;
  readonly chainSignature: Signature;
}

/**
 * Result of verifying a business transaction's full Execution chain.
 */
export interface ChainVerificationResult {
  readonly valid: boolean;
  readonly brokenAt?: string;
  readonly reason?: string;
}

/**
 * Execution Chain cryptographic operations.
 *
 * Signs a hash chain over the Executions belonging to one
 * business_transaction_id, reusing the same ArtifactSigner /
 * FileKeyProvider / DEFAULT_KEY_ID stack as every other signed
 * artifact (ReceiptCrypto, VerificationCrypto, PolicyChangeCrypto) --
 * not a third key to manage.
 *
 * A plain SHA-256 hash stored alongside the content it hashes gives no
 * protection against an actor who already has UPDATE rights on the
 * executions row (they can recompute a fresh valid hash over tampered
 * content in the same statement). Signing each chainHash with
 * Parmana's private key closes that: an actor with DB write access but
 * not the private key cannot forge a replacement chain link.
 */
export class ExecutionChainCrypto {
  private readonly crypto = CryptoBootstrap.create();

  private readonly signerPromise = SignerBootstrap.create();

  private readonly chainHasher = new ExecutionChainHasher(
    new TrustRecordHasher(this.crypto),
  );

  private readonly signer = new ArtifactSigner(this.crypto);

  private readonly verifier = new SignatureVerifier(this.crypto);

  /**
   * Creates the canonical immutable view of one Execution chain
   * link used for hashing and signing. Deliberately excludes
   * chainHash/chainSignature themselves -- the same discipline
   * VerificationCrypto.canonicalRecord already applies to
   * trustRecordHash/signature -- so the signed content never
   * includes its own signature.
   *
   * previousChainHash IS included: it is the chain-linking element,
   * and must be covered by the signature so an attacker cannot
   * re-point this link at a different predecessor without
   * invalidating chainSignature.
   */
  private canonicalChainEntry(
    execution: Execution,
    previousChainHash: string | null,
  ) {
    return {
      executionId: execution.executionId,

      businessTransactionId: execution.businessTransactionId,

      decision: execution.decision,

      status: execution.status,

      mode: execution.mode,

      startedAt: execution.startedAt,

      completedAt: execution.completedAt ?? null,

      evidence: execution.evidence ?? null,

      metadata: execution.metadata ?? null,

      previousChainHash,
    };
  }

  /**
   * Computes (chainHash, chainSignature) for one Execution given its
   * fixed previousChainHash -- the chain predecessor's chainHash, or
   * null for the first Execution in a business transaction's chain.
   */
  async chain(
    execution: Execution,
    previousChainHash: string | null,
  ): Promise<ExecutionChainFields> {
    const entry = this.canonicalChainEntry(execution, previousChainHash);

    const chainHash = await this.chainHasher.hash(entry);

    const keyId = DEFAULT_KEY_ID;

    const signer = await this.signerPromise;

    const value = await this.signer.signWithSigner(entry, keyId, signer);

    const chainSignature: Signature = {
      algorithm: this.crypto.signature.algorithm,

      keyId,

      value,

      signedAt: new Date(),
    };

    return {
      previousChainHash,
      chainHash,
      chainSignature,
    };
  }

  /**
   * Verifies one Execution's own chainHash and chainSignature against
   * its recomputed canonical content. Does not check chain linkage --
   * see verifyChain() for that.
   */
  async verifyEntry(execution: Execution): Promise<boolean> {
    if (
      execution.chainHash === undefined ||
      execution.chainSignature === undefined
    ) {
      return false;
    }

    const previousChainHash = execution.previousChainHash ?? null;

    const entry = this.canonicalChainEntry(execution, previousChainHash);

    const expectedHash = await this.chainHasher.hash(entry);

    if (expectedHash !== execution.chainHash) {
      return false;
    }

    const signer = await this.signerPromise;

    const publicKey = await signer.getPublicKey(execution.chainSignature.keyId);

    return this.verifier.verify(
      entry,
      execution.chainSignature.value,
      publicKey,
    );
  }

  /**
   * Walks Executions in their already-established (created_at, seq)
   * append order and verifies both per-entry authenticity and
   * previousChainHash linkage to the prior entry's chainHash.
   *
   * An Execution with no chain fields at all is treated as
   * unprotected legacy data -- neither verified nor required to
   * link -- so historical rows and pre-feature test fixtures don't
   * fail verification.
   */
  async verifyChain(
    executions: readonly Execution[],
  ): Promise<ChainVerificationResult> {
    let previous: Execution | undefined;
    let chainStarted = false;

    for (const execution of executions) {
      const isChained =
        execution.chainHash !== undefined &&
        execution.chainSignature !== undefined;

      //
      // chain() always writes chainHash and chainSignature together,
      // so an Execution carrying only some chain fields was altered:
      // removing chainSignature must not turn an edited Execution into
      // "unprotected legacy data" that is skipped. Likewise, once the
      // chain has started, a later Execution without chain fields is a
      // break, not legacy data: legacy Executions predate chaining.
      //
      const hasAnyChainField =
        execution.chainHash !== undefined ||
        execution.chainSignature !== undefined ||
        (execution.previousChainHash ?? null) !== null;

      if (!isChained && hasAnyChainField) {
        return {
          valid: false,
          brokenAt: execution.executionId,
          reason:
            "Execution carries only some chain fields; chainHash and chainSignature are always written together.",
        };
      }

      if (!isChained && chainStarted) {
        return {
          valid: false,
          brokenAt: execution.executionId,
          reason:
            "Execution has no chain fields but follows a chained execution.",
        };
      }

      if (isChained) {
        chainStarted = true;

        const entryValid = await this.verifyEntry(execution);

        if (!entryValid) {
          return {
            valid: false,
            brokenAt: execution.executionId,
            reason:
              "chainHash or chainSignature does not match recomputed content.",
          };
        }

        const expectedPrevious = previous?.chainHash ?? null;

        if ((execution.previousChainHash ?? null) !== expectedPrevious) {
          return {
            valid: false,
            brokenAt: execution.executionId,
            reason:
              "previousChainHash does not reference the prior execution's chainHash.",
          };
        }
      }

      previous = execution;
    }

    return { valid: true };
  }
}
