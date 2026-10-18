import type { SignatureAlgorithm } from "../config/CryptoAlgorithms.js";

/**
 * One entry in a hybrid-signed artifact's `signatures` array
 * (Hybrid Signature Support milestone, Phase A).
 *
 * Distinct from the legacy `Signature` domain type (signature.ts):
 * that type's singular `signature` field on ExecutionTrustRecord /
 * Receipt is always computed exactly as it was before this milestone,
 * over exactly the same canonical content, so pre-existing single-
 * signature records and third-party verifiers (@parmana/sign) that
 * only know that field keep working unchanged. `signatures` is
 * additive: present only on records signed under CRYPTO_MODE=hybrid,
 * where every entry must independently verify (see
 * HybridSignatureProvider in @parmana/crypto) -- a missing or
 * malformed entry is a rejection, never a silent downgrade to
 * checking only the legacy field.
 */
export interface SignatureEntry {
  readonly algorithm: SignatureAlgorithm;

  readonly keyId: string;

  readonly signature: string;
}
