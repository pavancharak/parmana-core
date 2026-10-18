/**
 * Canonical hash algorithms supported by Parmana.
 *
 * New algorithms are additive.
 */
export const HashAlgorithms = {
  SHA256: "sha256",
  SHA3512: "sha3-512",
  BLAKE3: "blake3",
} as const;

export type HashAlgorithm =
  (typeof HashAlgorithms)[keyof typeof HashAlgorithms];

/**
 * Canonical signature algorithms.
 */
export const SignatureAlgorithms = {
  ED25519: "ed25519",
  ECDSA_P256: "ecdsa-p256",

  //
  // Post-Quantum Ready
  //
  DILITHIUM3: "dilithium3",
  DILITHIUM5: "dilithium5",
  SPHINCS_PLUS: "sphincs-plus",
} as const;

export type SignatureAlgorithm =
  (typeof SignatureAlgorithms)[keyof typeof SignatureAlgorithms];

/**
 * Crypto signing modes.
 *
 * single: exactly one SignatureProvider (PRIMARY_SIGNATURE_PROVIDER)
 * signs and verifies everything -- today's behavior, unchanged.
 *
 * hybrid: PRIMARY_SIGNATURE_PROVIDER and SECONDARY_SIGNATURE_PROVIDER
 * both sign Execution Trust Records and Receipts; verification
 * requires both to pass. See HybridSignatureProvider (@parmana/crypto).
 *
 * pq: reserved for a future post-quantum-only mode. Not read by any
 * production call site today.
 */
export const CryptoModes = {
  SINGLE: "single",
  HYBRID: "hybrid",
  PQ: "pq",
} as const;

export type CryptoMode = (typeof CryptoModes)[keyof typeof CryptoModes];
