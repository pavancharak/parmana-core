import type { KeyObject } from "node:crypto";

import { CryptoError } from "../../errors/CryptoError.js";

/**
 * Asserts that a supplied KeyObject matches the
 * signature provider's expected native key type.
 *
 * node:crypto's sign()/verify() dispatch on the key's
 * own asymmetricKeyType, not on which SignatureProvider
 * happens to be configured. Without this check, a
 * dilithium3-configured process holding Ed25519 PEMs on
 * disk would silently sign with Ed25519 while labeling
 * the envelope "dilithium3".
 */
export function assertKeyType(
  key: KeyObject,
  expected: string,
  operation: "sign" | "verify",
): void {
  if (key.asymmetricKeyType !== expected) {
    throw new CryptoError(
      `${operation}() expected a "${expected}" key but received "${key.asymmetricKeyType}". ` +
        "The configured signature algorithm does not match the supplied key material.",
    );
  }
}
