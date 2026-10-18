/**
 * Decides whether an authenticated caller may assert a given
 * authority.principalId on a Business Transaction it submits.
 *
 * Without this check, authority/authorization fields are entirely
 * caller-declared and never cross-checked against the identity
 * actually proven by caller authentication (callerId) — any caller
 * holding any valid API key could claim to be any human/role in the
 * resulting signed trust record.
 *
 * Default (allowedPrincipalIds undefined): a key may only assert
 * itself — principalId must equal callerId exactly. This keeps an
 * unconfigured deployment fail-closed rather than fail-open: a key
 * with no explicit allowedPrincipalIds grant proves nothing beyond
 * its own identity.
 */
export function isPrincipalAllowed(
  principalId: string | undefined,
  callerId: string,
  allowedPrincipalIds: readonly string[] | undefined,
): boolean {
  if (!principalId) {
    return false;
  }

  if (allowedPrincipalIds !== undefined) {
    return allowedPrincipalIds.includes(principalId);
  }

  return principalId === callerId;
}
