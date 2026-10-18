import type { NextFunction, Request, Response } from "express";

/**
 * CORS for an explicit list of origins (ADR-0014, PARMANA_CORS_ORIGINS):
 * the docs site's playground calls the API from a browser.
 *
 * Only a listed origin gets an Access-Control-Allow-Origin header, and it
 * is that exact origin, never "*". A preflight (OPTIONS) from a listed
 * origin is answered here, before caller authentication, because a
 * browser sends no Authorization header on a preflight. A preflight from
 * any other origin gets 403 and no CORS headers. Requests without an
 * Origin header (servers, curl, the SDKs) pass through unchanged.
 *
 * Mounted only when at least one origin is configured; with none, the
 * API sends no CORS header at all, as before.
 */

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";
const EXPOSED_HEADERS = "Retry-After";
const MAX_AGE_SECONDS = "600";

export function createCorsMiddleware(origins: readonly string[]) {
  const allowed = new Set(origins);

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (origin === undefined) {
      next();
      return;
    }

    res.vary("Origin");

    if (!allowed.has(origin)) {
      if (req.method === "OPTIONS") {
        res.status(403).end();
        return;
      }

      next();
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      res.setHeader("Access-Control-Max-Age", MAX_AGE_SECONDS);
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Parses PARMANA_CORS_ORIGINS: comma separated origins, each
 * scheme://host[:port] with no path. Throws on anything else, so a typo
 * fails at startup instead of silently allowing nothing.
 */
export function parseCorsOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") return [];

  return value.split(",").map((raw) => {
    const entry = raw.trim();
    let url: URL;

    try {
      url = new URL(entry);
    } catch {
      throw new Error(
        `PARMANA_CORS_ORIGINS: "${entry}" is not an origin such as https://docs.parmanasystems.com.`,
      );
    }

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.origin !== entry
    ) {
      throw new Error(
        `PARMANA_CORS_ORIGINS: "${entry}" must be exactly an origin (scheme, host and optional port, no path or trailing slash), for example https://docs.parmanasystems.com.`,
      );
    }

    return url.origin;
  });
}
