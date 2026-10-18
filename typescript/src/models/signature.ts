/**
 * Parmana Signature.
 *
 * Cryptographic signature over a canonical Execution Trust Record,
 * proving it was produced by Parmana and has not been modified since
 * signing. See schemas/common/execution-trust-record.schema.json's
 * `signature` property.
 */

export type SignatureAlgorithm =
  "ed25519" | "ecdsa-p256" | "dilithium3" | "dilithium5" | "sphincs-plus";

export interface Signature {
  readonly algorithm: SignatureAlgorithm;

  readonly keyId: string;

  readonly value: string;

  readonly signedAt: Date;
}
