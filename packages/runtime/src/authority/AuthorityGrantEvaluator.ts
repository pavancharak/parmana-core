import type { Policy } from "@parmana/policy";
import {
  AuthorityStatus,
  type AuthorityAssessment,
  type AuthorityGrant,
  type AuthorityGrantLimit,
  type AuthorityGrantReference,
} from "@parmana/shared";

/**
 * Where the runtime finds a caller's grant (RFC-0023 phase 3). The
 * repository of grants approved through maker checker satisfies it.
 */
export interface AuthorityGrantSource {
  /**
   * The active (not revoked) grant for this caller and capability, or
   * null. It may have expired or not yet begun. A lookup that throws is
   * treated as AUTHORITY_UNCLEAR.
   */
  findActive(
    callerId: string,
    capability: string,
  ): Promise<AuthorityGrant | null>;
}

export interface AuthorityGrantRequest {
  readonly policy: Policy;

  /** The authenticated caller: the server set metadata.submittedBy. */
  readonly callerId: string | undefined;

  readonly capability: string;

  readonly intent: {
    readonly target?: string;
    readonly parameters?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Decides per-agent authority for a policy that requires it
 * (requireAuthorityGrant). Fails closed: AUTHORIZED only when the
 * authenticated caller holds an active grant for the capability, the
 * grant is in force now, and the request is within every limit it sets.
 *
 * - No authenticated caller, no grant (or only a revoked one), a grant
 *   not yet in force, or a request outside a limit: NOT_AUTHORIZED.
 * - A grant past validUntil: AUTHORITY_EXPIRED.
 * - No grant source configured, or one that fails: AUTHORITY_UNCLEAR.
 *
 * Returns undefined when the policy does not require a grant: authority
 * is then the existing checks alone.
 */
export class AuthorityGrantEvaluator {
  constructor(
    private readonly source: AuthorityGrantSource | undefined,
    private readonly options: { readonly now?: () => Date } = {},
  ) {}

  async evaluate(
    request: AuthorityGrantRequest,
  ): Promise<AuthorityAssessment | undefined> {
    if (request.policy.requireAuthorityGrant !== true) {
      return undefined;
    }

    const { callerId, capability } = request;

    if (callerId === undefined || callerId === "") {
      return {
        status: AuthorityStatus.NOT_AUTHORIZED,
        reason: `The policy requires an authority grant for "${capability}", but the request has no authenticated caller to hold one.`,
      };
    }

    if (this.source === undefined) {
      return {
        status: AuthorityStatus.AUTHORITY_UNCLEAR,
        reason: `The policy requires an authority grant for "${capability}", but no grant registry is configured.`,
      };
    }

    let grant: AuthorityGrant | null;

    try {
      grant = await this.source.findActive(callerId, capability);
    } catch (error) {
      return {
        status: AuthorityStatus.AUTHORITY_UNCLEAR,
        reason: `The authority grants of "${callerId}" could not be read (${
          error instanceof Error ? error.message : String(error)
        }).`,
      };
    }

    if (grant === null) {
      return {
        status: AuthorityStatus.NOT_AUTHORIZED,
        reason: `"${callerId}" holds no authority grant for "${capability}".`,
      };
    }

    const reference = toReference(grant);
    const now = (this.options.now ?? (() => new Date()))();

    if (now.getTime() < grant.validFrom.getTime()) {
      return {
        status: AuthorityStatus.NOT_AUTHORIZED,
        reason: `The authority grant of "${callerId}" for "${capability}" is in force only from ${grant.validFrom.toISOString()}.`,
        grant: reference,
      };
    }

    if (now.getTime() >= grant.validUntil.getTime()) {
      return {
        status: AuthorityStatus.AUTHORITY_EXPIRED,
        reason: `The authority grant of "${callerId}" for "${capability}" expired at ${grant.validUntil.toISOString()}.`,
        grant: reference,
      };
    }

    const breaches = Object.entries(grant.limits ?? {})
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .flatMap(([path, limit]) => {
        const breach = checkLimit(readIntentPath(request.intent, path), limit);
        return breach === undefined ? [] : [`${path} ${breach}`];
      });

    if (breaches.length > 0) {
      return {
        status: AuthorityStatus.NOT_AUTHORIZED,
        reason: `The request is outside the authority grant of "${callerId}" for "${capability}": ${breaches.join("; ")}.`,
        grant: reference,
      };
    }

    return {
      status: AuthorityStatus.AUTHORIZED,
      reason:
        `"${callerId}" holds authority grant ${grant.grantId} for "${capability}", ` +
        `in force until ${grant.validUntil.toISOString()}, and the request is within its limits.`,
      grant: reference,
    };
  }
}

function toReference(grant: AuthorityGrant): AuthorityGrantReference {
  return {
    grantId: grant.grantId,
    callerId: grant.callerId,
    capability: grant.capability,
    validFrom: grant.validFrom,
    validUntil: grant.validUntil,
    ...(grant.limits !== undefined && { limits: grant.limits }),
  };
}

/**
 * Why a value breaks a limit, or undefined when it is within it.
 */
function checkLimit(
  value: unknown,
  limit: AuthorityGrantLimit,
): string | undefined {
  if (limit.min !== undefined || limit.max !== undefined) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `must be a number, but the request has ${describe(value)}`;
    }

    if (limit.min !== undefined && value < limit.min) {
      return `is ${value}, below the granted minimum ${limit.min}`;
    }

    if (limit.max !== undefined && value > limit.max) {
      return `is ${value}, above the granted maximum ${limit.max}`;
    }
  }

  if (limit.oneOf !== undefined) {
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      !limit.oneOf.includes(value)
    ) {
      return `is ${describe(value)}, not one of ${JSON.stringify(limit.oneOf)}`;
    }
  }

  return undefined;
}

function describe(value: unknown): string {
  return value === undefined ? "nothing there" : JSON.stringify(value);
}

function readIntentPath(
  intent: AuthorityGrantRequest["intent"],
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, intent);
}
