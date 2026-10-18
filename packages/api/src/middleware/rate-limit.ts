import rateLimit from "express-rate-limit";
import type { Store } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60_000;

/**
 * express-rate-limit v8 does not globally augment Express's Request
 * type with `rateLimit` (no `declare global` in its own types; its
 * exported `AugmentedRequest` is an index-signature type that isn't
 * usable for direct property access) -- this narrow, local shape is
 * all rateLimitHandler actually needs from what the package attaches
 * to `req` at its default `requestPropertyName` ("rateLimit") before
 * calling `handler`.
 */
interface RequestWithRateLimitInfo {
  readonly rateLimit?: {
    readonly resetTime?: Date;
  };
}

/**
 * Shared 429 body/header shape for both limiters below. Sets
 * `Retry-After` explicitly from the store's own `resetTime` rather
 * than relying on a package default, so the header is correct
 * regardless of `express-rate-limit`'s own header-emission behavior
 * changing across versions.
 */
function rateLimitHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const resetTime = (req as unknown as RequestWithRateLimitInfo).rateLimit
    ?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(WINDOW_MS / 1000);

  res.setHeader("Retry-After", String(retryAfterSeconds));

  res.status(429).json({
    error: "Rate limit exceeded. Try again later.",
    code: "RATE_LIMITED",
  });
}

/**
 * Rate limiter for POST /execute, keyed by authenticated caller
 * identity (req.callerId), not IP — a design-partner integration
 * commonly calls from a shared backend IP, where an IP-keyed limit
 * would either starve every caller behind it or be too loose to mean
 * anything. Mounted only when caller authentication is enabled (see
 * app.ts): req.callerId does not exist at all when callerAuth is
 * "disabled" (local development only), and rate-limiting an anonymous
 * route by a caller identity that doesn't exist isn't a meaningful
 * control.
 *
 * Runs as ordinary Express middleware, ahead of the route handler
 * (createExecuteRouter): a rejected request never reaches
 * BusinessTransactionMapper, policy evaluation, or
 * RuntimeAuthorizationSigner — no nonce is consumed, nothing is
 * signed, for a request this middleware rejects.
 *
 * In-memory store (express-rate-limit's default): correct for a
 * single process, but each of this deployment's machines counts
 * independently — the effective ceiling for a caller is
 * `limitPerMinute * machineCount`, not fleet-wide. See CLAIMS.md
 * for this scope caveat stated as a claim, not just a comment.
 */
export function createExecuteRateLimiter(
  limitPerMinute: number,
  store?: Store,
) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: limitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    // No IP fallback: this limiter is only ever mounted when caller-auth
    // is enabled (see app.ts), and only ever reached for a request that
    // already ran past that middleware -- req.callerId is always set by
    // the time this executes, never falling through to an IP-based key
    // (which would also trip express-rate-limit's own IPv6-safety
    // validator for any keyGenerator that references req.ip at all).
    keyGenerator: (req: Request): string => req.callerId ?? "unknown",
    handler: rateLimitHandler,
    ...(store !== undefined ? { store } : {}),
  });
}

/**
 * Rate limiter for GET /health and GET /ready: unauthenticated routes
 * with no caller identity to key off, so this uses the package's
 * default IP-based keying (IPv6-safe out of the box in
 * express-rate-limit v8). Deliberately far more permissive than the
 * /execute limiter — these are cheap (no signing, /health touches
 * nothing external) and legitimately polled on a fixed interval by
 * PaaS health-check infrastructure (fly.toml's own check runs every
 * 30s per machine; this limiter must never be tight enough to throttle
 * that).
 */
export function createHealthReadyRateLimiter(
  limitPerMinute: number,
  store?: Store,
) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: limitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...(store !== undefined ? { store } : {}),
  });
}

/**
 * Rate limiter for the unauthenticated routes that do real work (G-78):
 * POST /refusal/verify, POST /execution-intents/verify and POST
 * /audit/verify check signatures, and /handbook writes a row to the
 * database. With no caller identity to key off, this uses the default
 * IP-based keying, like createHealthReadyRateLimiter, with its own
 * limit and its own Store (express-rate-limit refuses one Store behind
 * two limiters).
 */
/**
 * Failed caller authentications, keyed by IP. Mounted in front of
 * caller auth so it sees every authenticated route. Only a 401 counts:
 * a request with a valid key is not counted, so callers sharing an IP
 * are not throttled by each other's traffic, only by bad keys. Once an
 * IP passes the limit, every request from it gets 429 until the window
 * resets, which stops the signed caller.rejected audit write each bad
 * key would otherwise cost.
 */
export function createAuthFailureRateLimiter(
  limitPerMinute: number,
  store?: Store,
) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: limitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req: Request, res: Response): boolean =>
      res.statusCode !== 401,
    handler: rateLimitHandler,
    ...(store !== undefined ? { store } : {}),
  });
}

export function createPublicRateLimiter(limitPerMinute: number, store?: Store) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: limitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...(store !== undefined ? { store } : {}),
  });
}
