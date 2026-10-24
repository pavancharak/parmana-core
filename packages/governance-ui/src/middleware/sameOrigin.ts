import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request forgery defence for a cookie-authenticated UI.
 *
 * A state-changing request (anything but GET, HEAD or OPTIONS) is refused
 * when the browser says it came from another site. The browser's Origin
 * header is compared by host only: the scheme is not compared, because a
 * reverse proxy may terminate TLS and the app then sees http while the
 * browser sends https.
 *
 * A request with no Origin and no Sec-Fetch-Site (a non-browser client such
 * as curl) is allowed, since a browser CSRF attack always carries one of
 * these headers.
 */
export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const host = req.get("host");
  const origin = req.get("origin");

  if (origin !== undefined) {
    if (host !== undefined && originHost(origin) === host) {
      next();
      return;
    }
    res.status(403).send("Cross-site request refused.");
    return;
  }

  const fetchSite = req.get("sec-fetch-site");
  if (
    fetchSite === undefined ||
    fetchSite === "same-origin" ||
    fetchSite === "none"
  ) {
    next();
    return;
  }

  res.status(403).send("Cross-site request refused.");
}

function originHost(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}
