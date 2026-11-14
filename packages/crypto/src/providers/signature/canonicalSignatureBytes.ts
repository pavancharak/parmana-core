/**
 * Decodes a base64 signature only when the string is its canonical encoding.
 *
 * Buffer.from(_, "base64") is lenient: an Ed25519 signature has several
 * distinct strings that decode to the same bytes, because the unused low bits
 * of the final character are ignored. Accepting them lets one signature appear
 * under many identifiers. A string is canonical only when re-encoding its
 * decoded bytes gives back the same string.
 *
 * Returns undefined for any non-canonical input, so a verifier can refuse it.
 */
export function canonicalSignatureBytes(signature: string): Buffer | undefined {
  const bytes = Buffer.from(signature, "base64");

  return bytes.toString("base64") === signature ? bytes : undefined;
}
