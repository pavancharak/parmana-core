/**
 * Turns a server error into the next step a person can take. The codes are the
 * ones the Parmana API returns for policy governance.
 */
export interface ServerError {
  readonly status: number;
  readonly code: string | undefined;
  readonly message: string;
}

const HINTS: Readonly<Record<string, string>> = {
  CHECKER_NOT_IN_SCOPE:
    "The checker is not listed for this policy. An operator adds the checker to POLICY_CHANGE_CHECKERS for this policy and redeploys.",
  STEP_UP_AUTHORIZATION_INVALID:
    "The envelope is missing, expired, already used, or does not match this change. Sign a new envelope and send it right away.",
  CONFLICT:
    "A change for this policy version is already pending. Use the existing pending ID; do not propose again.",
};

/** Reads a server error body. Accepts {"code": ...} or {"error": "UPPER_CASE"}. */
export function parseServerError(status: number, body: string): ServerError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      status,
      code: undefined,
      message: body.trim() || "no response body",
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { status, code: undefined, message: body.trim() };
  }
  const record = parsed as Record<string, unknown>;
  const errorField =
    typeof record["error"] === "string" ? record["error"] : undefined;
  const code =
    typeof record["code"] === "string"
      ? record["code"]
      : errorField !== undefined && /^[A-Z_]+$/.test(errorField)
        ? errorField
        : undefined;
  const message =
    typeof record["message"] === "string"
      ? record["message"]
      : (errorField ?? "the server gave no message");
  return { status, code, message };
}

/** The next step for this error, or undefined when there is no specific advice. */
export function hintFor(error: ServerError): string | undefined {
  if (error.code !== undefined && HINTS[error.code] !== undefined) {
    return HINTS[error.code];
  }
  if (error.status === 401)
    return "The token is missing or wrong. Check PARMANA_TOKEN.";
  if (error.status === 403)
    return "This token is not allowed to do this. Check which credential is set.";
  if (error.status === 429)
    return "The API is rate limiting requests. Wait a minute and try again.";
  if (error.status === 400)
    return "The request body was rejected. Build it with the CLI rather than by hand.";
  return undefined;
}

/** Every server code that has a specific hint. The error reference page must list each one. */
export function hintCodes(): string[] {
  return Object.keys(HINTS);
}
