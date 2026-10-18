import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import "../session.js";
import {
  fetchPendingChanges,
  ApiClientError,
  ApiUnreachableError,
} from "../apiClient.js";
import { requireSession } from "../middleware/requireSession.js";
import { renderPendingChangesList } from "../views/list.js";
import { renderDiffPage } from "../views/diff.js";
import { renderErrorPage } from "../views/errorPage.js";

export function createPendingChangesRouter(apiBaseUrl: string): Router {
  const router = Router();

  router.use(requireSession);

  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const apiKey = req.session.apiKey as string;
      const callerId = req.session.callerId ?? "unknown";

      try {
        const changes = await fetchPendingChanges(apiBaseUrl, apiKey);

        res.send(renderPendingChangesList(changes, callerId));
      } catch (error) {
        handleFetchError(req, res, next, error, callerId);
      }
    },
  );

  router.get(
    "/pending-changes/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const apiKey = req.session.apiKey as string;
      const callerId = req.session.callerId ?? "unknown";

      try {
        const changes = await fetchPendingChanges(apiBaseUrl, apiKey);
        const change = changes.find(
          (candidate) => candidate.pendingPolicyChangeId === req.params.id,
        );

        if (change === undefined) {
          res
            .status(404)
            .send(
              renderErrorPage(
                `No pending change found with id '${req.params.id}'.`,
                callerId,
              ),
            );
          return;
        }

        res.send(renderDiffPage(change, callerId, apiBaseUrl));
      } catch (error) {
        handleFetchError(req, res, next, error, callerId);
      }
    },
  );

  return router;
}

/**
 * Shared error handling for both routes above: an expired/revoked key
 * (401) clears the session and sends the checker back to /login,
 * anything else (403 NON_HUMAN_CALLER_DENIED, 5xx, network failure)
 * renders in place -- this UI surfaces exactly what the API decided,
 * never reinterprets it. A genuinely unexpected error goes to
 * errorHandler.ts via next(), never thrown directly -- Express 4.x
 * does not catch a rejected promise from an async handler on its own.
 */
function handleFetchError(
  req: Request,
  res: Response,
  next: NextFunction,
  error: unknown,
  callerId: string,
): void {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      req.session.destroy(() => {
        res.redirect("/login");
      });
      return;
    }

    res.status(error.status).send(renderErrorPage(error.message, callerId));
    return;
  }

  if (error instanceof ApiUnreachableError) {
    res.status(502).send(renderErrorPage(error.message, callerId));
    return;
  }

  next(error);
}
