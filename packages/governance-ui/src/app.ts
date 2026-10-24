import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";

import { createLoginRouter } from "./routes/login.js";
import { createPendingChangesRouter } from "./routes/pendingChanges.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createCsrf } from "./middleware/csrf.js";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export interface CreateGovernanceUiAppOptions {
  readonly apiBaseUrl: string;
  readonly sessionSecret: string;
  readonly isProduction: boolean;
}

/**
 * Policy Governance internal UI (propose/list/diff-review only -- see
 * this package's README for the full scope and why approve/reject
 * are deliberately not here).
 *
 * Session store is express-session's default in-memory MemoryStore --
 * a restart logs every checker out, an accepted tradeoff for a
 * handful of internal users rather than standing up Redis or a
 * DB-backed store for this. The one thing that ever lives in a
 * session is the caller's own Parmana API key, sent as the
 * Authorization header on every request this UI makes on their
 * behalf -- it never reaches the browser except as an opaque, signed
 * session-id cookie.
 */
export function createGovernanceUiApp(options: CreateGovernanceUiAppOptions) {
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use(
    session({
      secret: options.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: options.isProduction,
        sameSite: "lax",
        maxAge: EIGHT_HOURS_MS,
      },
    }),
  );

  const csrf = createCsrf({
    secret: options.sessionSecret,
    isProduction: options.isProduction,
  });

  app.use((req, res, next) => {
    // Mark the session as modified so it is saved on every request. A visitor
    // who has not signed in yet then keeps one session id, which the CSRF
    // token is bound to. Without this, the id would change between the page
    // that shows the form and the request that submits it.
    req.session.csrfBound = true;
    res.locals.csrfToken = csrf.issueToken(req, res);
    next();
  });
  app.use(csrf.protect);

  app.use(createLoginRouter(options.apiBaseUrl));
  app.use(createPendingChangesRouter(options.apiBaseUrl));

  app.use(errorHandler);

  return app;
}
