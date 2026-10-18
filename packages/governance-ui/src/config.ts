/**
 * Fail-closed startup config, matching this codebase's existing
 * discipline (e.g. Config.ts's requirePolicyDirectory()): refuses to
 * start rather than let an unset value surface later as a confusing
 * runtime error.
 */

export interface GovernanceUiConfig {
  readonly apiBaseUrl: string;
  readonly sessionSecret: string;
  readonly port: number;
  readonly isProduction: boolean;
}

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} is not set. Refusing to start without it -- see this ` +
        "package's README for required environment variables.",
    );
  }

  return value;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The API key is sent as a bearer token to this URL, so a plain-HTTP or
 * credentialed URL is refused. Plain HTTP is allowed only for loopback.
 */
export function assertSafeApiBaseUrl(
  raw: string,
  isProduction: boolean,
): string {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("PARMANA_API_BASE_URL is not a valid absolute URL.");
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error(
      "PARMANA_API_BASE_URL must not contain credentials in the URL.",
    );
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname);

  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "PARMANA_API_BASE_URL must use https:// (http:// is allowed only for localhost).",
    );
  }

  if (isProduction && url.protocol !== "https:") {
    throw new Error("PARMANA_API_BASE_URL must use https:// in production.");
  }

  return raw.replace(/\/+$/, "");
}

export function loadGovernanceUiConfig(): GovernanceUiConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const apiBaseUrl = assertSafeApiBaseUrl(
    required("PARMANA_API_BASE_URL"),
    isProduction,
  );
  const sessionSecret = required("SESSION_SECRET");

  const port = Number(process.env.PORT ?? "4100");

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `PORT must be a positive integer, got '${process.env.PORT}'.`,
    );
  }

  return {
    apiBaseUrl,
    sessionSecret,
    port,
    isProduction,
  };
}
