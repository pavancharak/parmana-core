/**
 * One configured caller credential.
 *
 * Only the SHA-256 hash of the raw key is ever held here,
 * never the key itself. Multiple entries may share the
 * same callerId; that is how key rotation works (add the
 * new hash, keep the old one active during migration,
 * remove the old entry to revoke it).
 */
import type { AuthorityType } from "../domain/authority.js";

export interface ApiKeyEntry {
  readonly callerId: string;
  readonly keyHash: string;

  /**
   * The kind of entity that holds this credential -- operator-declared
   * metadata set only at issuance time (PARMANA_API_KEYS config,
   * scripts/generate-api-key.ts), never derived from or overridable by
   * anything in a request. Distinct from Authority.authorityType,
   * which is caller-declared, lives on a Business Transaction, and
   * describes the business action's asserted authority -- the two
   * must not be conflated. This field describes who was handed the
   * credential itself.
   *
   * Fail-closed default: an absent credentialHolderType means "not
   * verified," never "assume human." isHumanCaller.ts (the only
   * consumer of this field) treats every value other than exactly
   * AuthorityType.USER -- including undefined -- as non-human. Every
   * key provisioned before this field existed therefore has no
   * opinion on it and is denied access to endpoints that require a
   * verified human caller until explicitly re-provisioned with
   * credentialHolderType: USER. That is intentional, not a migration
   * bug.
   */
  readonly credentialHolderType?: AuthorityType;

  /**
   * The set of Authority.principalId / authorization.authorityId
   * values a Business Transaction authenticated with this key is
   * allowed to assert. Enforced by the caller-auth layer before
   * execution: nothing downstream of authentication otherwise
   * checks this, so an unset allowedPrincipalIds must default to
   * "only the callerId itself" — never "anything" — to keep the
   * fail-closed default an unconfigured deployment gets.
   *
   * Optional: omitting it means this key may only assert itself
   * (principalId === callerId) as its authority.
   */
  readonly allowedPrincipalIds?: readonly string[];

  /**
   * The set of capabilities (Intent.action values, e.g.
   * "hubspot:deal-update") a Business Transaction authenticated
   * with this key is allowed to invoke. Enforced by the caller-auth
   * layer before execution, the same boundary allowedPrincipalIds is
   * enforced at.
   *
   * Fail-closed default, deliberately the opposite default from
   * allowedPrincipalIds above: an unset or empty allowedCapabilities
   * denies every capability. Unlike principal scope, there is no
   * meaningful "may only act as itself" fallback for capabilities, so
   * an unconfigured key proves identity but is authorized to invoke
   * nothing until explicitly granted.
   *
   * The literal string "*" as an included entry grants every
   * capability — an explicit, auditable opt-in for intentionally
   * unrestricted callers (e.g. internal admin tooling), never an
   * implicit default.
   */
  readonly allowedCapabilities?: readonly string[];

  /**
   * The tenant ids a Business Transaction authenticated with this key
   * may name in metadata.tenantId. The tenant id selects the signing
   * key (`tenant.<tenantId>`, TenantKeyResolver), so it must come from
   * the key, not from whatever the caller writes in the request.
   *
   * Fail closed: unset or empty, a request that carries a tenantId is
   * refused with 403 TENANT_NOT_ALLOWED. A request with no tenantId is
   * unaffected and signs under the shared default key.
   */
  readonly allowedTenantIds?: readonly string[];

  /**
   * PEM-encoded (SPKI) Ed25519 public key for step-up authorization on
   * the Policy Governance approve/reject endpoints (isHumanCaller.ts's
   * call sites only) -- see PolicyChangeStepUpAuthorization. Generated
   * once by generate-api-key.ts's --generate-step-up-key flag,
   * genuinely independent of this entry's own keyHash: a distinct
   * keypair, never derived from or stored alongside the bearer token,
   * so a leak of one secret does not imply the other. Only the public
   * half is ever held here -- the private half is shown to the
   * operator once, the same as the bearer token's raw key, and is
   * never written to disk by this codebase.
   *
   * Absent means this caller cannot complete step-up at all: approve/
   * reject fail closed (StepUpAuthorizationInvalidError) rather than
   * treating a missing key as "step-up not required."
   */
  readonly stepUpPublicKey?: string;
}
