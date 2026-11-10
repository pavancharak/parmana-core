import { join } from "node:path";

import { CliUsageError } from "./errors.js";

export const DEFAULT_API_URL = "https://parmana-api-real.vercel.app";

/**
 * The optional config file holds only non-secret settings: named API addresses.
 * Tokens are never stored in it. They come from PARMANA_TOKEN only.
 */
export interface ConfigFile {
  readonly default?: string;
  readonly profiles: Readonly<Record<string, { readonly apiUrl?: string }>>;
}

export interface ResolvedTarget {
  readonly baseUrl: string;
  readonly profile: string | undefined;
}

export function configPath(env: NodeJS.ProcessEnv, homeDir: string): string {
  return env["PARMANA_CONFIG"] ?? join(homeDir, ".parmana", "config.json");
}

export function parseConfigFile(text: string): ConfigFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CliUsageError("The config file is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliUsageError("The config file must be a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  const profiles = record["profiles"] ?? {};
  if (
    typeof profiles !== "object" ||
    profiles === null ||
    Array.isArray(profiles)
  ) {
    throw new CliUsageError('The config file\'s "profiles" must be an object.');
  }
  const entries: Record<string, { apiUrl?: string }> = {};
  for (const [name, value] of Object.entries(
    profiles as Record<string, unknown>,
  )) {
    if (typeof value !== "object" || value === null) {
      throw new CliUsageError(`Profile "${name}" must be an object.`);
    }
    const apiUrl = (value as Record<string, unknown>)["apiUrl"];
    if (apiUrl !== undefined && typeof apiUrl !== "string") {
      throw new CliUsageError(
        `Profile "${name}" has an apiUrl that is not a string.`,
      );
    }
    entries[name] = apiUrl === undefined ? {} : { apiUrl };
  }
  const defaultProfile = record["default"];
  if (defaultProfile !== undefined && typeof defaultProfile !== "string") {
    throw new CliUsageError(
      'The config file\'s "default" must be a profile name.',
    );
  }
  return defaultProfile === undefined
    ? { profiles: entries }
    : { default: defaultProfile, profiles: entries };
}

/**
 * Removes trailing slashes with a plain loop. A regular expression such as
 * /\/+$/ can take quadratic time on a long run of slashes, so it is avoided.
 */
export function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function validateBaseUrl(url: string): string {
  const trimmed = withoutTrailingSlashes(url);
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(trimmed);
  if (!trimmed.startsWith("https://") && !local) {
    throw new CliUsageError(
      "The API address must be https, or a local http address.",
    );
  }
  return trimmed;
}

/**
 * Chooses the API address. Order: --api-url, PARMANA_API_URL, the profile's
 * apiUrl, then the production default. The profile itself is chosen by
 * --profile, then PARMANA_PROFILE, then the config file's default.
 */
export function resolveTarget(input: {
  readonly flagProfile: string | undefined;
  readonly flagApiUrl: string | undefined;
  readonly env: NodeJS.ProcessEnv;
  readonly config: ConfigFile | undefined;
}): ResolvedTarget {
  const profileName =
    input.flagProfile ?? input.env["PARMANA_PROFILE"] ?? input.config?.default;
  if (
    input.flagProfile !== undefined &&
    input.config?.profiles[input.flagProfile] === undefined
  ) {
    throw new CliUsageError(
      `No profile named "${input.flagProfile}" in the config file.`,
    );
  }
  const profile =
    profileName === undefined ? undefined : input.config?.profiles[profileName];
  const raw =
    input.flagApiUrl ??
    input.env["PARMANA_API_URL"] ??
    profile?.apiUrl ??
    DEFAULT_API_URL;
  return { baseUrl: validateBaseUrl(raw), profile: profileName };
}

/** The token, required only for commands that send a request. */
export function requireToken(env: NodeJS.ProcessEnv): string {
  const token = env["PARMANA_TOKEN"];
  if (token === undefined || token.trim().length === 0) {
    throw new CliUsageError(
      "Set PARMANA_TOKEN to your bearer token. It is read from the environment only.",
    );
  }
  return token.trim();
}
