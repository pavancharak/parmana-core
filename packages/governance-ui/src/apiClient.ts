import type { CallerIdentity, PendingPolicyChangeWithDiff } from "./types.js";

/**
 * Thrown for any non-2xx response from @parmana/api. `status` lets
 * callers distinguish "wrong/expired key" (401) from "key is valid
 * but not authorized for this" (403, e.g. NON_HUMAN_CALLER_DENIED)
 * from a genuine server error (5xx) -- this UI never re-implements
 * those checks itself, only surfaces what the API already decided.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/**
 * Thrown when the API could not be reached at all (network failure,
 * DNS, connection refused) -- kept distinct from ApiClientError so
 * the UI can tell a caller "the Parmana API is unreachable" apart
 * from "your key was rejected," rather than conflating the two under
 * one generic error message.
 */
export class ApiUnreachableError extends Error {
  constructor(cause: unknown) {
    super(
      `Could not reach the Parmana API: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "ApiUnreachableError";
  }
}

async function authenticatedGet(
  apiBaseUrl: string,
  apiKey: string,
  path: string,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // A stalled API must not hold a request, or a login, open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new ApiUnreachableError(error);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };

    throw new ApiClientError(
      typeof body.error === "string"
        ? body.error
        : `Request to ${path} failed with status ${response.status}.`,
      response.status,
    );
  }

  return response.json();
}

/**
 * Validates a submitted API key against the API's own self-identity
 * endpoint -- the natural place to confirm a key is real before
 * storing it in a session, not a check this UI invents on its own.
 */
export async function fetchCallerIdentity(
  apiBaseUrl: string,
  apiKey: string,
): Promise<CallerIdentity> {
  return (await authenticatedGet(
    apiBaseUrl,
    apiKey,
    "/callers/me",
  )) as CallerIdentity;
}

/**
 * Fetches every pending change (each with its diff view already
 * embedded by the API). There is no single-item GET endpoint --
 * the diff page fetches this same list and picks out one entry by
 * id, a deliberate choice over adding a new API endpoint for this UI
 * alone.
 */
export async function fetchPendingChanges(
  apiBaseUrl: string,
  apiKey: string,
): Promise<readonly PendingPolicyChangeWithDiff[]> {
  const body = (await authenticatedGet(
    apiBaseUrl,
    apiKey,
    "/policies/pending-changes",
  )) as { changes: readonly PendingPolicyChangeWithDiff[] };

  return body.changes;
}
