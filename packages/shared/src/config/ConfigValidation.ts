import {
  CryptoModes,
  type CryptoMode,
  HashAlgorithms,
  type HashAlgorithm,
  SignatureAlgorithms,
  type SignatureAlgorithm,
} from "./CryptoAlgorithms.js";

import { StorageProviders, type StorageProvider } from "./StorageProviders.js";

import { KeyProviders, type KeyProvider } from "./KeyProviders.js";

import { SecretsProviders, type SecretsProvider } from "./SecretsProviders.js";

import { TrustProfiles, type TrustProfile } from "./TrustProfiles.js";

import { createPublicKey } from "node:crypto";

import type { ApiKeyEntry } from "./ApiKeyEntry.js";
import { AuthorityType } from "../domain/authority.js";

function parse<T extends string>(
  value: string | undefined,
  values: Record<string, T>,
  name: string,
  defaultValue: T,
): T {
  const resolved = value ?? defaultValue;

  if (Object.values(values).includes(resolved as T)) {
    return resolved as T;
  }

  throw new Error(`Invalid ${name}: ${resolved}`);
}

export const parseStorageProvider = (value?: string): StorageProvider => {
  if (process.env.DATABASE_PROVIDER !== undefined) {
    throw new Error(
      "DATABASE_PROVIDER is no longer read; set PARMANA_STORAGE instead.",
    );
  }

  return parse(
    value,
    StorageProviders,
    "PARMANA_STORAGE",
    StorageProviders.MEMORY,
  );
};

export const parseCryptoMode = (value?: string): CryptoMode =>
  parse(value, CryptoModes, "CRYPTO_MODE", CryptoModes.SINGLE);

export const parseHashAlgorithm = (value?: string): HashAlgorithm =>
  parse(value, HashAlgorithms, "HASH_PROVIDER", HashAlgorithms.SHA256);

/**
 * Accepted input aliases for a SignatureAlgorithm config value, resolved
 * to the canonical internal identifier before validation. Additive only:
 * the canonical identifiers themselves (SignatureAlgorithms' own values,
 * e.g. "dilithium3") are never renamed, so an existing
 * PRIMARY_SIGNATURE_PROVIDER=dilithium3 deployment is unaffected. Lets a
 * new deployment use "ml-dsa-65" (the NIST/FIPS 204 standard name this
 * codebase's own docs already use when describing "dilithium3" to
 * readers) without a breaking rename of the internal identifier itself.
 */
const SIGNATURE_ALGORITHM_ALIASES: Record<string, SignatureAlgorithm> = {
  "ml-dsa-65": SignatureAlgorithms.DILITHIUM3,
};

export const parseSignatureAlgorithm = (value?: string): SignatureAlgorithm =>
  parse(
    value !== undefined ? (SIGNATURE_ALGORITHM_ALIASES[value] ?? value) : value,
    SignatureAlgorithms,
    "SIGNATURE_PROVIDER",
    SignatureAlgorithms.ED25519,
  );

export const parseKeyProvider = (value?: string): KeyProvider =>
  parse(value, KeyProviders, "KEY_PROVIDER", KeyProviders.LOCAL);

/**
 * Unlike the other settings, an invalid value is not echoed: a value set
 * in the wrong variable can be a real secret (a token pasted into
 * PARMANA_SECRETS_PROVIDER, say), and this message reaches logs. Kept
 * separate from parse() so the value never reaches its message.
 */
export const parseSecretsProvider = (value?: string): SecretsProvider => {
  const accepted = Object.values(SecretsProviders);
  const match = accepted.find((provider) => provider === value);

  if (value === undefined) {
    return SecretsProviders.ENV;
  }

  if (match === undefined) {
    throw new Error(
      `Invalid PARMANA_SECRETS_PROVIDER: expected one of ${accepted.join(", ")}`,
    );
  }

  return match;
};

export const parseTrustProfile = (value?: string): TrustProfile =>
  parse(value, TrustProfiles, "TRUST_PROFILE", TrustProfiles.V1);

const API_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Parses PARMANA_API_KEYS: a JSON array of
 * { "callerId": string, "keyHash": string } entries.
 *
 * Returns an empty array when unset — callers of this
 * function decide what an empty result means (the
 * caller-authenticator bootstrap treats it as "refuse to
 * start unless auth is explicitly disabled").
 */
export function parseApiKeys(value?: string): ApiKeyEntry[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "PARMANA_API_KEYS is not valid JSON. Expected an array of " +
        '{ "callerId": string, "keyHash": string } entries.',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "PARMANA_API_KEYS must be a JSON array of " +
        '{ "callerId": string, "keyHash": string } entries.',
    );
  }

  return parsed.map((entry, index): ApiKeyEntry => {
    const record = entry as Record<string, unknown>;

    const validEntry =
      typeof entry === "object" &&
      entry !== null &&
      typeof record.callerId === "string" &&
      record.callerId !== "" &&
      typeof record.keyHash === "string" &&
      API_KEY_HASH_PATTERN.test(record.keyHash);

    if (!validEntry) {
      throw new Error(
        `PARMANA_API_KEYS[${index}] is invalid. Each entry must be ` +
          '{ "callerId": non-empty string, "keyHash": 64-character lowercase hex }.',
      );
    }

    const allowedPrincipalIds = record.allowedPrincipalIds;

    if (allowedPrincipalIds !== undefined) {
      const validAllowedPrincipalIds =
        Array.isArray(allowedPrincipalIds) &&
        allowedPrincipalIds.every((id) => typeof id === "string" && id !== "");

      if (!validAllowedPrincipalIds) {
        throw new Error(
          `PARMANA_API_KEYS[${index}].allowedPrincipalIds must be an array ` +
            "of non-empty strings when present.",
        );
      }
    }

    const allowedCapabilities = record.allowedCapabilities;

    if (allowedCapabilities !== undefined) {
      const validAllowedCapabilities =
        Array.isArray(allowedCapabilities) &&
        allowedCapabilities.every(
          (capability) => typeof capability === "string" && capability !== "",
        );

      if (!validAllowedCapabilities) {
        throw new Error(
          `PARMANA_API_KEYS[${index}].allowedCapabilities must be an array ` +
            'of non-empty strings when present. Use "*" as an entry to ' +
            "grant every capability.",
        );
      }
    }

    const allowedTenantIds = record.allowedTenantIds;

    if (allowedTenantIds !== undefined) {
      const validAllowedTenantIds =
        Array.isArray(allowedTenantIds) &&
        allowedTenantIds.every((id) => typeof id === "string" && id !== "");

      if (!validAllowedTenantIds) {
        throw new Error(
          `PARMANA_API_KEYS[${index}].allowedTenantIds must be an array ` +
            "of non-empty strings when present.",
        );
      }
    }

    const credentialHolderType = record.credentialHolderType;

    if (credentialHolderType !== undefined) {
      const validCredentialHolderType =
        typeof credentialHolderType === "string" &&
        Object.values(AuthorityType).includes(
          credentialHolderType as AuthorityType,
        );

      if (!validCredentialHolderType) {
        throw new Error(
          `PARMANA_API_KEYS[${index}].credentialHolderType must be one of ` +
            `${Object.values(AuthorityType).join(", ")} when present.`,
        );
      }
    }

    const stepUpPublicKey = record.stepUpPublicKey;

    if (stepUpPublicKey !== undefined) {
      const validShape =
        typeof stepUpPublicKey === "string" && stepUpPublicKey.trim() !== "";

      let validKey = false;

      if (validShape) {
        try {
          const keyObject = createPublicKey(stepUpPublicKey as string);
          validKey = keyObject.asymmetricKeyType === "ed25519";
        } catch {
          validKey = false;
        }
      }

      if (!validShape || !validKey) {
        throw new Error(
          `PARMANA_API_KEYS[${index}].stepUpPublicKey must be a PEM-encoded ` +
            "Ed25519 public key when present.",
        );
      }
    }

    return {
      callerId: record.callerId as string,
      keyHash: record.keyHash as string,
      ...(allowedPrincipalIds !== undefined
        ? { allowedPrincipalIds: allowedPrincipalIds as readonly string[] }
        : {}),
      ...(allowedCapabilities !== undefined
        ? { allowedCapabilities: allowedCapabilities as readonly string[] }
        : {}),
      ...(allowedTenantIds !== undefined
        ? { allowedTenantIds: allowedTenantIds as readonly string[] }
        : {}),
      ...(credentialHolderType !== undefined
        ? { credentialHolderType: credentialHolderType as AuthorityType }
        : {}),
      ...(stepUpPublicKey !== undefined
        ? { stepUpPublicKey: stepUpPublicKey as string }
        : {}),
    };
  });
}
