/**
 * Parmana SDK
 *
 * Maps a non-2xx HTTP response from the Parmana Runtime to the
 * corresponding typed SDK error.
 *
 * The real Runtime envelope (packages/api/src/middleware/error-handler.ts)
 * is `{ "error": string }`, sometimes with a second `code` field. `code`
 * is present only when the failure reached the shared error handler as a
 * typed error carrying its own status/code (RuntimeError, or a
 * ParmanaError subclass such as NonceAlreadyConsumedError); most 4xx
 * responses carry no `code` at all. Classification below is therefore
 * driven primarily by HTTP status, with `code` used to distinguish the
 * cases that need it. This API returns THREE distinct 403 shapes, not
 * two — a fact this docstring previously got wrong:
 * - `code: "POLICY_DENIED"` — a policy REJECTED decision, mapped to
 *   ExecutionRejectedError, checked first since it needs a wholly
 *   different SDK error class.
 * - `code: "CAPABILITY_NOT_ALLOWED"` — a caller invoking a capability
 *   it isn't permitted to invoke (isCapabilityAllowed.ts). Checked
 *   explicitly (not left to fall through the generic status branch
 *   below) so its `code` is preserved on AuthorizationError.serverCode
 *   instead of being silently dropped.
 * - no `code` at all — a caller asserting an authority.principalId it
 *   isn't permitted to assert (isPrincipalAllowed.ts,
 *   packages/api/src/routes/execute.ts and transactions.ts). Also maps
 *   to AuthorizationError, via the generic `status === 403` branch.
 * See /api-reference/error-catalog for the exhaustive, real, verified
 * list this mapping is built from.
 *
 * Previously, a policy rejection had no dedicated status of its own and
 * fell through to a generic `500` with `code: "RUNTIME_ERROR"` — this
 * function used to special-case exactly that shape to still produce an
 * ExecutionRejectedError. That gap is now fixed at the source
 * (packages/runtime/src/ExecutionGate.ts, packages/api/src/middleware/
 * error-handler.ts); this mapping was updated to match, not to work
 * around the old ambiguity.
 *
 * One route, POST /policies/validate, does not use this envelope at all
 * (every status it returns is `{valid, errors}`); PolicyApi.validate
 * opts out of this mapping entirely via TransportRequest.throwOnHttpError,
 * so this function is never called for that route's responses.
 */

import { ValidationError } from "../errors/ValidationError.js";
import { AuthenticationError } from "../errors/AuthenticationError.js";
import { AuthorizationError } from "../errors/AuthorizationError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { ConflictError } from "../errors/ConflictError.js";
import { ExecutionRejectedError } from "../errors/ExecutionRejectedError.js";
import { RateLimitError } from "../errors/RateLimitError.js";
import { InternalServerError } from "../errors/InternalServerError.js";
import type { ParmanaError } from "../errors/ParmanaError.js";

interface ErrorEnvelope {
  readonly error?: unknown;
  readonly code?: unknown;
}

function extractMessage(status: number, body: unknown): string {
  if (body !== null && typeof body === "object" && "error" in body) {
    const message = (body as ErrorEnvelope).error;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return `Request failed with status ${status}.`;
}

function extractCode(body: unknown): string | undefined {
  if (body !== null && typeof body === "object" && "code" in body) {
    const code = (body as ErrorEnvelope).code;

    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

/**
 * Parses a `Retry-After` header value into seconds. Per RFC 9110 this is
 * either an integer number of seconds or an HTTP-date; this API only
 * ever sends the integer-seconds form (express-rate-limit's default),
 * so an HTTP-date is treated as absent rather than guessed at.
 */
function extractRetryAfterSeconds(
  headers: Record<string, string> | undefined,
): number | undefined {
  const raw = headers?.["retry-after"];

  if (raw === undefined) {
    return undefined;
  }

  const seconds = Number(raw);

  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Maps a non-2xx HTTP response to the typed SDK error it should be
 * thrown as. `headers` is optional only so existing direct callers
 * (tests, primarily) that don't have a header set need not supply one —
 * every real HttpTransport response has one.
 */
export function mapHttpErrorResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): ParmanaError {
  const error = buildHttpError(status, body, headers);

  // Set here, once, rather than threaded through every error class's
  // constructor: every error this function returns came from an HTTP
  // response, and carries its status.
  Object.defineProperty(error, "statusCode", {
    value: status,
    enumerable: true,
    writable: false,
  });

  return error;
}

function buildHttpError(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): ParmanaError {
  const message = extractMessage(status, body);
  const code = extractCode(body);

  // Checked ahead of the generic status branches: a policy REJECTED
  // decision carries this exact code alongside its 403 status, and must
  // not be classified as the *other* 403 this API returns (a
  // caller-identity/principal mismatch, which carries no code at all).
  if (code === "POLICY_DENIED") {
    return new ExecutionRejectedError(message);
  }

  // Also checked ahead of the generic status branches, for the same
  // reason as POLICY_DENIED above: a capability-denied 403 carries this
  // code, and letting it fall through to the generic `status === 403`
  // branch below would still produce the right error class
  // (AuthorizationError) but silently drop the code — checking it here
  // preserves it on `serverCode` instead.
  if (code === "CAPABILITY_NOT_ALLOWED" || code === "TENANT_NOT_ALLOWED") {
    return new AuthorizationError(message, { serverCode: code });
  }

  if (status === 400) {
    return new ValidationError(message);
  }

  if (status === 401) {
    return new AuthenticationError(message);
  }

  if (status === 403) {
    return new AuthorizationError(message);
  }

  if (status === 404) {
    return new NotFoundError(message);
  }

  if (status === 409) {
    return new ConflictError(message);
  }

  if (status === 429) {
    const retryAfterSeconds = extractRetryAfterSeconds(headers);

    return new RateLimitError(message, {
      ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
    });
  }

  // Preserve the Runtime's own code, if any. Notably SIGNING_UNAVAILABLE
  // (503, nothing executed) and EXECUTION_RECORD_INCOMPLETE (500, the action
  // WAS released, do not retry as a new transaction), see InternalServerError.
  return new InternalServerError(
    message,
    code !== undefined ? { serverCode: code } : undefined,
  );
}
