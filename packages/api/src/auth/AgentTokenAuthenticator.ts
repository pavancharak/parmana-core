import {
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from "node:crypto";

import type {
  CallerAuthenticator,
  CallerIdentity,
} from "./CallerAuthenticator.js";
import { hashApiKey } from "./hashApiKey.js";

/**
 * Per-agent identity with short-lived access tokens (RFC-0024, option 3).
 *
 * An outside agent is registered once, with its own client id and secret. It exchanges
 * that secret for an access token that expires within minutes, and sends only the token
 * with each request. The secret is never sent with a business request, and a revoked
 * agent is refused on its next request, even while a token it holds is still unexpired.
 *
 * A token is "<base64url payload>.<base64url Ed25519 signature>". The payload is JSON:
 * { iss, sub, aud, iat, exp, jti }, where sub is the agent id. Parmana signs it with its
 * token key, and the signature is checked on every request.
 */

export const AGENT_TOKEN_ISSUER = "parmana";
/** Longest lifetime a token may have, in seconds. A longer token was not issued by this module. */
export const AGENT_TOKEN_MAX_LIFETIME_S = 900;
/** Lifetime given to a newly issued token when the caller asks for none, in seconds. */
export const AGENT_TOKEN_DEFAULT_LIFETIME_S = 600;
/** How far the clock may be off before a token is refused as early or expired, in seconds. */
const CLOCK_SKEW_S = 30;

/** One registered outside agent. Only the hash of its secret is held here. */
export interface AgentRecord {
  readonly agentId: string;
  readonly clientId: string;
  /** SHA-256 hex of the agent's client secret, from hashApiKey. Never the secret itself. */
  readonly clientSecretHash: string;
  readonly allowedCapabilities?: readonly string[];
  readonly allowedPrincipalIds?: readonly string[];
  readonly allowedTenantIds?: readonly string[];
  readonly revoked: boolean;
}

/**
 * Where agent records live. Must be read on every request, so a revocation takes effect
 * at once. A store error must reject the lookup, and the callers below then refuse.
 */
export interface AgentRegistry {
  findByAgentId(agentId: string): Promise<AgentRecord | undefined>;
  findByClientId(clientId: string): Promise<AgentRecord | undefined>;
}

export interface AgentTokenOptions {
  /** Parmana's token signing key, Ed25519 private. Used only to issue. */
  readonly signingKey?: KeyObject;
  /** Parmana's token verifying key, Ed25519 public. Used to check every token. */
  readonly verifyingKey: KeyObject;
  /** This service's URL. A token is accepted only if it was issued for this audience. */
  readonly audience: string;
  readonly registry: AgentRegistry;
  readonly now?: () => Date;
}

interface TokenPayload {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

/** Checks an access token and returns the agent's identity, or undefined when it must be refused. */
export class AgentTokenAuthenticator implements CallerAuthenticator {
  constructor(private readonly options: AgentTokenOptions) {}

  async authenticate(credential: string | undefined): Promise<CallerIdentity | undefined> {
    if (!credential) return undefined;

    const payload = verifyTokenSignature(credential, this.options.verifyingKey);
    if (payload === undefined) return undefined;

    const nowS = Math.floor((this.options.now ?? (() => new Date()))().getTime() / 1000);
    if (!isTimelyAndScoped(payload, this.options.audience, nowS)) return undefined;

    // Fails closed: a store error refuses the request rather than trusting a token it could not check.
    let record: AgentRecord | undefined;
    try {
      record = await this.options.registry.findByAgentId(payload.sub);
    } catch {
      return undefined;
    }
    if (record === undefined || record.revoked || record.agentId !== payload.sub) return undefined;

    return identityOf(record);
  }
}

/**
 * Exchanges an agent's client id and secret for an access token. Returns undefined for any
 * failure: unknown client, wrong secret, revoked agent, or a store error. The reason is not
 * given, so a caller cannot tell which client ids exist.
 */
export async function issueAgentToken(
  request: { readonly clientId: string; readonly clientSecret: string; readonly lifetimeS?: number },
  options: AgentTokenOptions,
): Promise<{ readonly accessToken: string; readonly tokenType: "Bearer"; readonly expiresIn: number } | undefined> {
  if (options.signingKey === undefined) return undefined;
  const lifetimeS = request.lifetimeS ?? AGENT_TOKEN_DEFAULT_LIFETIME_S;
  if (!Number.isInteger(lifetimeS) || lifetimeS <= 0 || lifetimeS > AGENT_TOKEN_MAX_LIFETIME_S) return undefined;

  let record: AgentRecord | undefined;
  try {
    record = await options.registry.findByClientId(request.clientId);
  } catch {
    return undefined;
  }
  if (record === undefined || record.revoked) return undefined;
  if (!secretMatches(request.clientSecret, record.clientSecretHash)) return undefined;

  const nowS = Math.floor((options.now ?? (() => new Date()))().getTime() / 1000);
  const payload: TokenPayload = {
    iss: AGENT_TOKEN_ISSUER,
    sub: record.agentId,
    aud: options.audience,
    iat: nowS,
    exp: nowS + lifetimeS,
    jti: randomUUID(),
  };
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = sign(null, Buffer.from(body, "utf8"), options.signingKey).toString("base64url");
  return { accessToken: `${body}.${signature}`, tokenType: "Bearer", expiresIn: lifetimeS };
}

/** Returns the payload when the token's signature verifies against the key, otherwise undefined. */
function verifyTokenSignature(token: string, key: KeyObject): TokenPayload | undefined {
  const parts = token.split(".");
  if (parts.length !== 2) return undefined;
  const [body, signature] = parts as [string, string];
  try {
    const ok = verify(null, Buffer.from(body, "utf8"), key, Buffer.from(signature, "base64url"));
    if (!ok) return undefined;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
    return isPayload(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isTimelyAndScoped(payload: TokenPayload, audience: string, nowS: number): boolean {
  if (payload.iss !== AGENT_TOKEN_ISSUER) return false;
  if (payload.aud !== audience) return false;
  if (payload.iat > nowS + CLOCK_SKEW_S) return false;
  if (payload.exp < nowS - CLOCK_SKEW_S) return false;
  const lifetime = payload.exp - payload.iat;
  return lifetime > 0 && lifetime <= AGENT_TOKEN_MAX_LIFETIME_S;
}

function isPayload(value: unknown): value is TokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.iss === "string" &&
    typeof p.sub === "string" &&
    p.sub.length > 0 &&
    typeof p.aud === "string" &&
    typeof p.iat === "number" &&
    typeof p.exp === "number" &&
    typeof p.jti === "string"
  );
}

/** Compares a presented secret with the stored hash in constant time. */
function secretMatches(secret: string, storedHashHex: string): boolean {
  const candidate = Buffer.from(hashApiKey(secret), "hex");
  const stored = Buffer.from(storedHashHex, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function identityOf(record: AgentRecord): CallerIdentity {
  return {
    callerId: record.agentId,
    ...(record.allowedCapabilities !== undefined ? { allowedCapabilities: record.allowedCapabilities } : {}),
    ...(record.allowedPrincipalIds !== undefined ? { allowedPrincipalIds: record.allowedPrincipalIds } : {}),
    ...(record.allowedTenantIds !== undefined ? { allowedTenantIds: record.allowedTenantIds } : {}),
    // Deliberately no credentialHolderType: an agent is not a verified human (fail-closed, see ApiKeyEntry).
  };
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}
