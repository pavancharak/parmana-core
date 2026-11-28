import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";

import { AuthorityType } from "@parmana/shared";

import type {
  CallerAuthenticator,
  CallerIdentity,
} from "./CallerAuthenticator.js";

/**
 * The claims a GitHub Actions OIDC token must carry, and the identity it maps to.
 * Phase 1 of docs/internal/designs/PROBE-OIDC-AUTH.md. Not wired into production yet.
 */
export interface GitHubOidcPolicy {
  /** Token issuer, pinned. */
  readonly issuer: string;
  /** Where GitHub publishes the signing keys. */
  readonly jwksUrl: string;
  /** The `aud` value the workflow must request and this API must expect. */
  readonly audience: string;
  /** Numeric id of the repository, as a string, from the `repository_id` claim. */
  readonly repositoryId: string;
  /** The `ref` claim, for example refs/heads/main. */
  readonly ref: string;
  /** The `job_workflow_ref` claim, pinning the workflow file and its ref. */
  readonly jobWorkflowRef: string;
  /** Values the `event_name` claim may take. */
  readonly allowedEventNames: readonly string[];
  /** The caller id the identity is given. */
  readonly callerId: string;
  /** The only capability the identity holds. */
  readonly capability: string;
  /** Longest permitted gap between `iat` and `exp`. */
  readonly maxLifetimeSeconds: number;
  /** Allowed clock difference between GitHub and this server. */
  readonly clockSkewSeconds: number;
  /** Minimum gap between JWKS fetches triggered by an unknown `kid`. */
  readonly jwksRefreshIntervalSeconds: number;
}

export type JwksFetcher = (url: string) => Promise<{ keys: unknown[] }>;

export interface GitHubOidcAuthenticatorOptions {
  readonly policy: GitHubOidcPolicy;
  /** Injected in tests. Defaults to an HTTPS fetch with a timeout. */
  readonly fetchJwks?: JwksFetcher;
  /** Unix time in seconds. Injected in tests. */
  readonly now?: () => number;
  /**
   * Called with the reason each time a token is refused. Never receives the
   * token itself, so it is safe to log.
   */
  readonly onRejected?: (reason: string) => void;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Authenticates a GitHub Actions OIDC token as a fixed, narrow caller.
 *
 * Fails closed. Every refusal returns undefined and, when a reporter is given,
 * a reason. Signatures are checked with RS256 only, against keys fetched from
 * GitHub's JWKS, and the claims are pinned to the policy.
 */
export class GitHubOidcAuthenticator implements CallerAuthenticator {
  private readonly policy: GitHubOidcPolicy;
  private readonly fetchJwks: JwksFetcher;
  private readonly now: () => number;
  private readonly onRejected: ((reason: string) => void) | undefined;
  private keys = new Map<string, KeyObject>();
  private lastFetchAt: number | undefined;

  constructor(options: GitHubOidcAuthenticatorOptions) {
    this.policy = options.policy;
    this.fetchJwks = options.fetchJwks ?? fetchJwksOverHttps;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.onRejected = options.onRejected;
  }

  async authenticate(
    credential: string | undefined,
  ): Promise<CallerIdentity | undefined> {
    if (!credential) return undefined;

    try {
      return await this.verify(credential);
    } catch (error) {
      return this.reject(
        `verification error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async verify(token: string): Promise<CallerIdentity | undefined> {
    const segments = token.split(".");
    if (
      segments.length !== 3 ||
      segments.some((segment) => segment === "" || !BASE64URL.test(segment))
    ) {
      return this.reject("malformed token");
    }

    const [headerSegment, payloadSegment, signatureSegment] = segments as [
      string,
      string,
      string,
    ];
    const header = parseJsonObject(headerSegment);
    const payload = parseJsonObject(payloadSegment);
    if (header === undefined || payload === undefined) {
      return this.reject("malformed token");
    }

    if (header.alg !== "RS256") {
      return this.reject("unsupported algorithm");
    }
    if (typeof header.kid !== "string") {
      return this.reject("missing kid");
    }

    const key = await this.keyFor(header.kid);
    if (key === undefined) {
      return this.reject("unknown signing key");
    }

    const signed = Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8");
    const signature = Buffer.from(signatureSegment, "base64url");
    if (!verifySignature("sha256", signed, key, signature)) {
      return this.reject("bad signature");
    }

    const claimProblem = this.checkClaims(payload);
    if (claimProblem !== undefined) {
      return this.reject(claimProblem);
    }

    return {
      callerId: this.policy.callerId,
      allowedCapabilities: [this.policy.capability],
      credentialHolderType: AuthorityType.SERVICE,
    };
  }

  private checkClaims(payload: Record<string, unknown>): string | undefined {
    const { policy } = this;
    const now = this.now();
    const skew = policy.clockSkewSeconds;

    if (payload.iss !== policy.issuer) return "wrong issuer";

    const aud = payload.aud;
    const audienceMatches =
      aud === policy.audience ||
      (Array.isArray(aud) && aud.includes(policy.audience));
    if (!audienceMatches) return "wrong audience";

    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      return "missing exp or iat";
    }
    if (now - skew >= payload.exp) return "expired";
    if (payload.iat > now + skew) return "issued in the future";
    if (
      payload.nbf !== undefined &&
      (typeof payload.nbf !== "number" || payload.nbf > now + skew)
    ) {
      return "not yet valid";
    }

    const lifetime = payload.exp - payload.iat;
    if (lifetime <= 0 || lifetime > policy.maxLifetimeSeconds) {
      return "token lifetime out of bounds";
    }

    if (String(payload.repository_id) !== policy.repositoryId) {
      return "wrong repository";
    }
    if (payload.ref !== policy.ref) return "wrong ref";
    if (payload.job_workflow_ref !== policy.jobWorkflowRef) {
      return "wrong workflow";
    }
    if (
      typeof payload.event_name !== "string" ||
      !policy.allowedEventNames.includes(payload.event_name)
    ) {
      return "wrong event";
    }

    return undefined;
  }

  /**
   * Returns the public key for a `kid`. Keys are cached. An unknown `kid`
   * triggers a refetch at most once per refresh interval, so a stream of
   * forged `kid` values cannot hammer GitHub.
   */
  private async keyFor(kid: string): Promise<KeyObject | undefined> {
    const now = this.now();
    const never = this.lastFetchAt === undefined;
    const unknownAndDue =
      !this.keys.has(kid) &&
      this.lastFetchAt !== undefined &&
      now - this.lastFetchAt >= this.policy.jwksRefreshIntervalSeconds;

    if (never || unknownAndDue) {
      this.lastFetchAt = now;
      await this.refreshKeys();
    }

    return this.keys.get(kid);
  }

  private async refreshKeys(): Promise<void> {
    const response = await this.fetchJwks(this.policy.jwksUrl);
    const next = new Map<string, KeyObject>();

    for (const candidate of response.keys) {
      if (!isRecord(candidate)) continue;
      if (candidate.kty !== "RSA" || typeof candidate.kid !== "string")
        continue;
      if (candidate.use !== undefined && candidate.use !== "sig") continue;
      if (candidate.alg !== undefined && candidate.alg !== "RS256") continue;

      try {
        next.set(
          candidate.kid,
          createPublicKey({ key: candidate as JsonWebKey, format: "jwk" }),
        );
      } catch {
        // One malformed key must not stop the others from verifying.
        continue;
      }
    }

    this.keys = next;
  }

  private reject(reason: string): undefined {
    this.onRejected?.(reason);
    return undefined;
  }
}

function parseJsonObject(segment: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    );
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const JWKS_TIMEOUT_MS = 5_000;

async function fetchJwksOverHttps(url: string): Promise<{ keys: unknown[] }> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`JWKS request failed with HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.keys)) {
    throw new Error("JWKS response has no keys array");
  }
  return { keys: body.keys };
}
