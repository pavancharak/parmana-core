import type { NextFunction, Request, Response } from "express";

import "../session.js";

/**
 * Gates every route except /login and /logout. No session apiKey ->
 * redirect to /login; this UI never has its own notion of "who can
 * see this," it only has "is there a key on file to ask the API
 * with" -- every actual authorization decision (human-only,
 * capability scope, ...) is the API's, not this middleware's.
 */
export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session.apiKey === undefined) {
    res.redirect("/login");
    return;
  }

  next();
}
