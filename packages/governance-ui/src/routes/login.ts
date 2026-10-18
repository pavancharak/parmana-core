import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";

import "../session.js";
import {
  fetchCallerIdentity,
  ApiClientError,
  ApiUnreachableError,
} from "../apiClient.js";
import { renderLoginPage } from "../views/login.js";

/**
 * This tool's only unauthenticated route: an attacker who can reach it
 * (internal network access is still required -- see this package's
 * README) could otherwise submit an unbounded number of API keys with
 * no throttle at all, a credential-stuffing/brute-force vector every
 * other route in this codebase's actual API doesn't have (the real
 * Parmana API has no "try a key and see" login endpoint -- every
 * request there either carries a valid key or is rejected once, not
 * probed repeatedly against one route). IP-keyed (no caller identity
 * exists yet at this point -- that's the whole point of this route).
 */
const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
const LOGIN_PAGE_RATE_LIMIT_MAX_REQUESTS = 60;

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createLoginRouter(apiBaseUrl: string): Router {
  const router = Router();

  // Constructed per router (per createGovernanceUiApp call), not at
  // module scope: express-rate-limit's default MemoryStore is scoped to
  // this one middleware instance, and a module-scoped singleton would
  // share attempt counts across every app instance a process ever
  // creates -- harmless in production (one app per process), but wrong
  // for tests, which build a fresh app per case and expect a fresh
  // limiter each time.
  const loginRateLimiter = rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Page loads get their own, more generous limiter, so viewing the
  // login page does not use up the sign-in attempts above.
  const loginPageRateLimiter = rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: LOGIN_PAGE_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get(
    "/login",
    loginPageRateLimiter,
    (req: Request, res: Response): void => {
      if (req.session.apiKey !== undefined) {
        res.redirect("/");
        return;
      }

      res.send(renderLoginPage());
    },
  );

  router.post(
    "/login",
    loginRateLimiter,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const apiKey =
        typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

      if (apiKey === "") {
        res.status(400).send(renderLoginPage("API key is required."));
        return;
      }

      try {
        const identity = await fetchCallerIdentity(apiBaseUrl, apiKey);

        // Regenerate the session id on login (not merely reuse an
        // anonymous pre-login session) -- standard session-fixation
        // hardening, cheap to do here regardless of how small this
        // tool's user base is.
        await regenerateSession(req);

        req.session.apiKey = apiKey;
        req.session.callerId = identity.callerId;

        res.redirect("/");
      } catch (error) {
        if (error instanceof ApiClientError) {
          const message =
            error.status === 401
              ? "Invalid API key."
              : `The Parmana API rejected this key: ${error.message}`;

          res.status(401).send(renderLoginPage(message));
          return;
        }

        if (error instanceof ApiUnreachableError) {
          res.status(502).send(renderLoginPage(error.message));
          return;
        }

        next(error);
      }
    },
  );

  router.post("/logout", (req: Request, res: Response): void => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });

  return router;
}
