import { existsSync, readFileSync } from "node:fs";

import { join } from "node:path";

import { loadConfig } from "@parmana/shared";

/**
 * One key's expiry/revocation metadata.
 */
export interface KeyExpiryEntry {
  readonly expiresAt?: Date;
  readonly revoked?: boolean;
}

/**
 * Looks up expiry/revocation metadata for a keyId.
 */
export interface KeyExpiryStore {
  get(keyId: string): Promise<KeyExpiryEntry | undefined>;
}

/**
 * File Key Expiry Store.
 *
 * Reads one small sidecar JSON file beside the PEM key files
 * FileKeyProvider already reads from the same configured key
 * directory: `<keyDirectory>/key-expiry.json`, shape
 * `{ "<keyId>": { "expiresAt"?: ISO string, "revoked"?: boolean } }`.
 *
 * A keyId absent from the file, or the file itself being absent,
 * means "no expiry, always valid" -- the safe default that keeps
 * every deployment that doesn't opt into key expiry behaving exactly
 * as it does today. Consistent with FileKeyProvider's own documented
 * scope: intended for development and self-hosted deployments: no
 * external KMS/vault dependency, no env-var-encoded key material.
 */
export class FileKeyExpiryStore implements KeyExpiryStore {
  private readonly config = loadConfig();

  private readonly keyDirectory = this.config.keys.keyDirectory ?? "./keys";

  async get(keyId: string): Promise<KeyExpiryEntry | undefined> {
    const path = join(this.keyDirectory, "key-expiry.json");

    if (!existsSync(path)) {
      return undefined;
    }

    const raw = readFileSync(path, "utf8");

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${path} is not valid JSON.`);
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(`${path} must be a JSON object keyed by keyId.`);
    }

    const entry = (parsed as Record<string, unknown>)[keyId];

    if (entry === undefined) {
      return undefined;
    }

    const { expiresAt, revoked } = entry as {
      expiresAt?: unknown;
      revoked?: unknown;
    };

    if (
      expiresAt !== undefined &&
      (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt)))
    ) {
      //
      // An unparseable date became an Invalid Date, and EnvelopeVerifier's
      // `expiresAt <= now` is false for it, so a typo silently left the
      // key valid forever. Refused instead, like every other malformed
      // entry in this file.
      //
      throw new Error(
        `${path}["${keyId}"].expiresAt must be an ISO 8601 date string.`,
      );
    }

    if (revoked !== undefined && typeof revoked !== "boolean") {
      throw new Error(`${path}["${keyId}"].revoked must be a boolean.`);
    }

    return {
      ...(expiresAt !== undefined && {
        expiresAt: new Date(expiresAt),
      }),

      ...(revoked !== undefined && { revoked }),
    };
  }
}
