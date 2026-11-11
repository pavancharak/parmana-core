/**
 * Records, for an error thrown on the release path before the connector ran,
 * whether the release verifier consumed the authorization's nonce.
 *
 * The error object itself is thrown unchanged, so its class, message and
 * code are the same for every caller. The Gateway reads this record to decide
 * what to do with the outcome row.
 * - nonceConsumed false: the verifier refused before consuming the nonce. The
 *   Gateway deletes its in-flight row, so a corrected retry can be released.
 * - nonceConsumed true: the nonce is consumed. The Gateway records the refusal
 *   as `failed`, and a retry is refused with the reason.
 *
 * Errors that are not marked are treated as possibly after the connector ran.
 */
const refusals = new WeakMap<object, { readonly nonceConsumed: boolean }>();

export function markReleaseRefusal(
  error: unknown,
  nonceConsumed: boolean,
): void {
  if (typeof error === "object" && error !== null) {
    refusals.set(error, { nonceConsumed });
  }
}

export function releaseRefusalOf(
  error: unknown,
): { readonly nonceConsumed: boolean } | undefined {
  if (typeof error === "object" && error !== null) {
    return refusals.get(error);
  }

  return undefined;
}
