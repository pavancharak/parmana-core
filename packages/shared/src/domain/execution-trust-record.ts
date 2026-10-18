import { BusinessTransaction } from "./business-transaction.js";
import { Execution } from "./execution.js";
import { Override } from "./override.js";
import { Verification } from "./verification.js";
import { Receipt } from "./receipt.js";
import { Signature } from "./signature.js";
import { SignatureEntry } from "./signature-entry.js";
import { SignedExecutionAuthorization } from "./execution-authorization.js";
import { EvidenceAnchor } from "./evidence-anchor.js";

/**
 * Parmana Trust Core
 *
 * Execution Trust Record
 *
 * Canonical immutable record representing everything
 * Parmana knows about a Business Transaction.
 *
 * The Execution Trust Record is the authoritative
 * source for replay, verification, audit, and
 * receipt generation.
 */
export interface ExecutionTrustRecord {
  /**
   * Unique Execution Trust Record identifier.
   */
  readonly trustRecordId: string;

  /**
   * Business Transaction identifier.
   */
  readonly businessTransactionId: string;

  /**
   * Canonical Business Transaction.
   */
  readonly transaction: BusinessTransaction;

  /**
   * Optional Override history.
   *
   * Business rules currently allow a single accepted
   * Override, but the history is modeled as an array
   * to preserve append-only evolution.
   */
  readonly overrides: readonly Override[];

  /**
   * Execution history.
   *
   * Multiple Executions may exist for long-running
   * workflows, retries, or future execution models.
   */
  readonly executions: readonly Execution[];

  /**
   * Verification history.
   *
   * Every verification produces a new immutable
   * Verification artifact.
   */
  readonly verifications: readonly Verification[];

  /**
   * Receipt history.
   *
   * Receipts are immutable cryptographic attestations
   * of Execution Trust Record state.
   */
  readonly receipts: readonly Receipt[];

  /**
   * The Signed Execution Authorization the Execution Gateway accepted
   * for this transaction -- the exact nonce, expiry, businessTransaction/
   * policy/signals hashes, and signature ExecutionGateway.verify()
   * checked before dispatching to a connector.
   *
   * Absent for any Trust Record built before this field existed, or
   * for a transaction that never reached execution (e.g. a policy
   * rejection, which never produces an authorization at all). Absent
   * is not a defect: it means "no authorization exists for this
   * record," not "one exists but wasn't captured." A present value is
   * included in the canonical hash/signature (see
   * VerificationCrypto.canonicalRecord()) so a loaded record's
   * authorization cannot be swapped or stripped without invalidating
   * trustRecordHash/signature -- verified independently of the
   * authorization's own embedded signature, which an auditor can also
   * check on its own terms via AuthorizationVerifier (@parmana/crypto).
   */
  readonly authorization?: SignedExecutionAuthorization;

  /**
   * Canonical hash of the Execution Trust Record.
   *
   * Computed over the canonical serialized form of
   * this aggregate.
   */
  readonly trustRecordHash: string;

  /**
   * Cryptographic signature over the canonical
   * Execution Trust Record.
   *
   * This proves the Trust Record was produced by
   * Parmana and has not been modified since signing.
   */
  readonly signature: Signature;

  /**
   * Envelope schema version (Hybrid Signature Support milestone,
   * Phase A). Absent means schema v1: exactly today's shape,
   * `signature` is the sole cryptographic attestation. Present and
   * >= 2 means `signatures` (below) was populated at signing time and
   * MUST be independently verified in full -- see
   * HybridSignatureProvider (@parmana/crypto). Optional rather than
   * defaulted so every pre-existing construction site (including
   * historical records already in storage) keeps compiling and
   * verifying unchanged; readers MUST treat an absent value as v1.
   */
  readonly schemaVersion?: number;

  /**
   * Additional signatures over this record, one per algorithm,
   * produced only when CRYPTO_MODE=hybrid was active at signing time.
   * `signature` above remains the authoritative single-algorithm
   * attestation (unchanged, always present); this array is additive
   * proof that a second, independent algorithm also signed the same
   * content. A verifier that finds this array non-empty MUST require
   * every entry to verify -- a missing or malformed entry is a
   * rejection, never a silent fallback to `signature` alone.
   */
  readonly signatures?: readonly SignatureEntry[];

  /**
   * UTC timestamp when the Execution Trust Record
   * was first created.
   */
  readonly createdAt: Date;

  /**
   * UTC timestamp when the Execution Trust Record
   * was last extended with a new immutable artifact.
   */
  readonly updatedAt: Date;

  /**
   * Explicit binding artifact linking policy-governance provenance
   * (transaction.policy.contentHash/governanceAnchor, G-24/G-45) to
   * what a connector actually did (executions[].evidence.attributes.connector,
   * G-46) -- see EvidenceAnchor's own doc comment
   * (docs/VERIFICATION-GAPS.md G-45's residual "Record 3 is outside
   * all three [policy-governance] mechanisms" note). Absent on a
   * Trust Record built before this field existed.
   */
  readonly evidenceAnchor?: EvidenceAnchor;
}
