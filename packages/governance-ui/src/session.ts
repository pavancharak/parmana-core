import "express-session";

/**
 * The API key lives here, and only here -- never in a cookie, never
 * rendered into a response body, never logged. express-session signs
 * and stores this server-side (in-memory for this package -- see the
 * README); the browser only ever holds an opaque session id cookie.
 */
declare module "express-session" {
  interface SessionData {
    apiKey?: string;
    callerId?: string;
  }
}
