import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";

import { AuthorityType, parseApiKeys } from "@parmana/shared";

import { PRIVATE_KEY_MODE, writeKeyFile } from "./lib/key-files.js";

export interface ApiKeyEntry {
  callerId: string;
  keyHash: string;
  allowedPrincipalIds?: string[];
  allowedCapabilities?: string[];
  credentialHolderType?: AuthorityType;
  stepUpPublicKey?: string;
}

export interface GeneratedApiKey {
  rawKey: string;
  entry: ApiKeyEntry;

  /**
   * PEM-encoded (PKCS8) Ed25519 private key, present only when
   * --generate-step-up-key was requested. Shown to the operator once,
   * exactly like rawKey: never written to disk by this script, never
   * recoverable once this terminal closes. Genuinely independent of
   * rawKey -- a separate generateKeyPairSync("ed25519") call, not
   * derived from it -- so a leak of one secret does not imply the
   * other. See scripts/sign-policy-change-step-up.ts, the tool a
   * checker runs against this key to produce a
   * PolicyChangeStepUpAuthorization envelope.
   */
  stepUpPrivateKey?: string;
}

export interface GenerateApiKeyOptions {
  callerId: string;
  allowedPrincipalIds?: string[];
  allowedCapabilities?: string[];
  credentialHolderType?: AuthorityType;

  /**
   * Generates a separate Ed25519 keypair for step-up authorization
   * (Policy Governance, maker-checker, Layer 4) -- see
   * ApiKeyEntry.stepUpPublicKey. Explicit opt-in, never implicit from
   * credentialHolderType: USER alone, matching this codebase's
   * "explicit, auditable grant, never an implicit default" convention
   * (mirrors allowedCapabilities' own "*" wildcard precedent).
   * Requires credentialHolderType: USER -- step-up only has meaning
   * for a human-credentialed checker.
   */
  generateStepUpKey?: boolean;
}

export interface AppendApiKeyOptions {
  replace?: boolean;
}

export interface AppendApiKeyResult {
  totalEntries: number;
}

const API_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generateApiKey({
  callerId,
  allowedPrincipalIds,
  allowedCapabilities,
  credentialHolderType,
  generateStepUpKey,
}: GenerateApiKeyOptions): GeneratedApiKey {
  const normalizedCallerId = callerId.trim();

  if (!normalizedCallerId) {
    throw new Error("--caller-id must be a non-empty string.");
  }

  if (generateStepUpKey && credentialHolderType !== AuthorityType.USER) {
    throw new Error(
      "--generate-step-up-key requires --credential-holder-type USER: " +
        "step-up authorization only has meaning for a human-credentialed checker.",
    );
  }

  const normalizedPrincipalIds = allowedPrincipalIds
    ?.map((id) => id.trim())
    .filter(Boolean);

  const normalizedCapabilities = allowedCapabilities
    ?.map((capability) => capability.trim())
    .filter(Boolean);

  const rawKey = randomBytes(32).toString("base64url");

  const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

  if (!API_KEY_HASH_PATTERN.test(keyHash)) {
    throw new Error("Generated key hash has an invalid format.");
  }

  const entry: ApiKeyEntry = {
    callerId: normalizedCallerId,
    keyHash,
  };

  if (normalizedPrincipalIds && normalizedPrincipalIds.length > 0) {
    entry.allowedPrincipalIds = normalizedPrincipalIds;
  }

  if (normalizedCapabilities && normalizedCapabilities.length > 0) {
    entry.allowedCapabilities = normalizedCapabilities;
  }

  if (credentialHolderType !== undefined) {
    entry.credentialHolderType = credentialHolderType;
  }

  let stepUpPrivateKey: string | undefined;

  if (generateStepUpKey) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");

    entry.stepUpPublicKey = publicKey
      .export({ format: "pem", type: "spki" })
      .toString();

    stepUpPrivateKey = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
  }

  return {
    rawKey,
    entry,
    ...(stepUpPrivateKey !== undefined ? { stepUpPrivateKey } : {}),
  };
}

export function parseAllowedPrincipalIds(
  value: string | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("--allowed-principal-ids contained no non-empty values.");
  }

  return values;
}

/**
 * Parses --allowed-capabilities the same way
 * parseAllowedPrincipalIds parses --allowed-principal-ids. No
 * special-case handling for "*": it is just one more non-empty
 * string value, whose wildcard meaning is interpreted downstream by
 * isCapabilityAllowed.ts, not here.
 */
export function parseAllowedCapabilities(
  value: string | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("--allowed-capabilities contained no non-empty values.");
  }

  return values;
}

/**
 * Parses --credential-holder-type: an optional, operator-declared
 * value naming who was actually handed this credential -- see
 * ApiKeyEntry.credentialHolderType's own doc comment for the
 * fail-closed default (absent means "not verified," never "assume
 * human") and isHumanCaller.ts for its one consumer. Must be one of
 * AuthorityType's values when present -- there is no free-text case
 * the way capabilities/principal IDs allow, since this field is
 * checked by exact enum match, not membership in a caller-declared
 * set.
 */
export function parseCredentialHolderType(
  value: string | undefined,
): AuthorityType | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!Object.values(AuthorityType).includes(trimmed as AuthorityType)) {
    throw new Error(
      `--credential-holder-type must be one of ${Object.values(AuthorityType).join(", ")}.`,
    );
  }

  return trimmed as AuthorityType;
}

export function formatApiKeysValue(
  entries: ApiKeyEntry[],
  format: "json" | "env",
): string {
  const json = JSON.stringify(entries);

  if (format === "json") {
    return json;
  }

  return `PARMANA_API_KEYS=${json}`;
}

export function appendApiKeyEntry(
  path: string,
  entry: ApiKeyEntry,
  options: AppendApiKeyOptions = {},
): AppendApiKeyResult {
  let entries: ApiKeyEntry[] = [];

  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8").trim();

    if (existing) {
      const envMatch = existing.match(/^PARMANA_API_KEYS=(.*)$/m);

      if (envMatch) {
        entries = parseApiKeys(envMatch[1]);
      } else {
        entries = parseApiKeys(existing);
      }
    }
  }

  const existingIndex = entries.findIndex(
    (existingEntry) => existingEntry.callerId === entry.callerId,
  );

  if (existingIndex !== -1) {
    if (!options.replace) {
      throw new Error(`Caller ID "${entry.callerId}" already has an entry`);
    }

    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }

  const serialized = JSON.stringify(entries);

  if (path.endsWith(".env")) {
    let content = existsSync(path) ? readFileSync(path, "utf8") : "";

    const envLine = `PARMANA_API_KEYS=${serialized}`;

    if (/^PARMANA_API_KEYS=.*$/m.test(content)) {
      content = content.replace(/^PARMANA_API_KEYS=.*$/m, envLine);
    } else {
      if (content.length > 0 && !content.endsWith("\n")) {
        content += "\n";
      }

      content += `${envLine}\n`;
    }

    // The file holds the agents' API keys: owner-only, whatever the umask.
    writeKeyFile(path, content, PRIVATE_KEY_MODE, true);
  } else {
    writeKeyFile(path, `${serialized}\n`, PRIVATE_KEY_MODE, true);
  }

  return {
    totalEntries: entries.length,
  };
}

function argument(args: string[], name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

function main(args = process.argv.slice(2)): void {
  const callerId = argument(args, "--caller-id");

  const allowedPrincipalIds = parseAllowedPrincipalIds(
    args.includes("--allowed-principal-ids")
      ? argument(args, "--allowed-principal-ids")
      : undefined,
  );

  const allowedCapabilities = parseAllowedCapabilities(
    args.includes("--allowed-capabilities")
      ? argument(args, "--allowed-capabilities")
      : undefined,
  );

  const credentialHolderType = parseCredentialHolderType(
    args.includes("--credential-holder-type")
      ? argument(args, "--credential-holder-type")
      : undefined,
  );

  const generateStepUpKey = args.includes("--generate-step-up-key");

  const { rawKey, entry, stepUpPrivateKey } = generateApiKey({
    callerId,
    allowedPrincipalIds,
    allowedCapabilities,
    credentialHolderType,
    generateStepUpKey,
  });

  console.log();
  console.log("API key generated");
  console.log("--------------------------------");
  console.log("Caller ID :", entry.callerId);
  console.log("Key       :", rawKey);
  console.log("Key hash  :", entry.keyHash);
  console.log();
  console.log(
    "Give the key above to the caller now. It is not written to disk by",
  );
  console.log(
    "this script and cannot be recovered once this terminal is closed.",
  );
  console.log("Only the hash below is ever persisted.");
  console.log();

  if (stepUpPrivateKey !== undefined) {
    console.log(
      "Step-up authorization key generated (separate from the bearer key above)",
    );
    console.log("--------------------------------");
    console.log(stepUpPrivateKey);
    console.log(
      "Give this private key to the checker now, over a separate channel from",
    );
    console.log(
      "the bearer key above if possible. It is not written to disk by this",
    );
    console.log(
      "script and cannot be recovered once this terminal is closed. Only the",
    );
    console.log(
      "public half (in the entry below) is ever persisted. The checker uses",
    );
    console.log(
      "it with scripts/sign-policy-change-step-up.ts to approve/reject policy",
    );
    console.log("changes.");
    console.log();
  }

  console.log("Add this entry to PARMANA_API_KEYS (a JSON array):");
  console.log(JSON.stringify(entry));
  console.log();
}

if (process.env.VITEST === undefined) {
  main();
}
