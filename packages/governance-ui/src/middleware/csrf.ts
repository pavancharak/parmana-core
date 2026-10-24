import { doubleCsrf } from "csrf-csrf";

import "../session.js";

export interface CsrfOptions {
  readonly secret: string;
  readonly isProduction: boolean;
}

/**
 * Token-based CSRF protection for the governance UI's cookie-authenticated
 * forms (double-submit pattern, from csrf-csrf).
 *
 * Each token is bound to the session id, so a token from one session cannot
 * be replayed in another. The token travels in the `_csrf` form field, and
 * the matching secret travels in a cookie that a cross-site page cannot read.
 */
export function createCsrf(options: CsrfOptions) {
  const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => options.secret,
    getSessionIdentifier: (req) => req.session.id,
    cookieName: options.isProduction ? "__Host-parmana-csrf" : "parmana-csrf",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: options.isProduction,
      path: "/",
    },
    size: 64,
    getCsrfTokenFromRequest: (req) => req.body?._csrf,
  });

  return {
    issueToken: generateCsrfToken,
    protect: doubleCsrfProtection,
  };
}
