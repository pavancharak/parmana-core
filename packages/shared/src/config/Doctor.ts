import { createPublicKey } from "node:crypto";

import { parseHybridRequiredFrom, parseHybridSchemaVersion } from "./Config.js";
import {
  CryptoModes,
  HashAlgorithms,
  SignatureAlgorithms,
} from "./CryptoAlgorithms.js";
import { KeyProviders } from "./KeyProviders.js";
import {
  parseApiKeys,
  parseCryptoMode,
  parseHashAlgorithm,
  parseKeyProvider,
  parseSignatureAlgorithm,
  parseStorageProvider,
  parseTrustProfile,
} from "./ConfigValidation.js";

/**
 * One check from the configuration doctor. "pass" means the setting is valid,
 * "warn" means it works but needs attention, and "fail" means the server would
 * refuse to start, or would refuse requests. A fail always carries a fix.
 */
export interface DoctorCheck {
  readonly name: string;
  readonly level: "pass" | "warn" | "fail";
  readonly message: string;
  readonly fix?: string;
}

export interface DoctorReaders {
  readonly directoryExists: (path: string) => boolean;
  /** Names of the entries in a folder. Empty when the folder cannot be read. */
  readonly listDirectory: (path: string) => string[];
  readonly readFile: (path: string) => string;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The key pair the server requires for every signing operation. It is the same
 * name the signing code uses (DEFAULT_KEY_ID in @parmana/crypto). That package
 * depends on this one, so the name is repeated here rather than imported.
 */
const DEFAULT_KEY_ID = "default";

/**
 * Every PARMANA_ name read by this repository. A name outside this list is
 * reported as a probable typo, because the server ignores it without a word.
 */
export const KNOWN_PARMANA_SETTINGS: readonly string[] = [
  "PARMANA_ALLOW_UNGOVERNED_POLICY",
  "PARMANA_API_BASE_URL",
  "PARMANA_API_KEYS",
  "PARMANA_API_URL",
  "PARMANA_AUTH_DISABLED",
  "PARMANA_CORS_ORIGINS",
  "PARMANA_DB_SCHEMA",
  "PARMANA_GATEWAY_ID",
  "PARMANA_GATEWAY_KEY_ID",
  "PARMANA_KEY_DIR",
  "PARMANA_KEY_MATERIAL_JSON",
  "PARMANA_POLICY_DIR",
  "PARMANA_SANDBOX",
  "PARMANA_SANDBOX_APPROVER_ID",
  "PARMANA_SANDBOX_APPROVER_KEY_ID",
  "PARMANA_SANDBOX_APPROVER_PRIVATE_KEY",
  "PARMANA_SECRETS_PROVIDER",
  "PARMANA_SKIP_DOTENV",
  "PARMANA_STORAGE",
  "PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE",
  "PARMANA_TEST_DATABASE_URL",
  "PARMANA_VERIFICATION_KEY_ID",
  "PARMANA_VERIFICATION_SECONDARY_KEY_ID",
  "PARMANA_VERIFIER_KEY_ID",
];

/**
 * Runs the configuration checks for the local deployment and returns every
 * result, not just the first failure.
 *
 * Each setting is checked with the same parser the server uses, so a check
 * cannot pass here and fail at startup. Parser error messages are never shown,
 * because some of them echo the value they rejected, and a secret pasted into
 * the wrong setting would then appear in the output. Messages here name the
 * setting and the allowed values only.
 *
 * Settings for the production deployment (aws-kms, Postgres storage) are
 * reported as not yet checked, rather than checked wrongly. They follow in a
 * later stage.
 */
export function diagnoseConfiguration(
  env: Env,
  readers: DoctorReaders,
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const add = (check: DoctorCheck) => checks.push(check);

  checkStorage(env, add);
  checkCrypto(env, add);
  checkHybrid(env, add);
  checkKeys(env, readers, add);
  checkPolicy(env, readers, add);
  checkAuth(env, add);
  checkTrustProfile(env, add);
  checkNumbers(env, add);
  checkUnknownSettings(env, add);

  return checks;
}

function checkStorage(env: Env, add: (check: DoctorCheck) => void): void {
  const name = "PARMANA_STORAGE";
  if (env.DATABASE_PROVIDER !== undefined) {
    add({
      name: "DATABASE_PROVIDER",
      level: "fail",
      message: "DATABASE_PROVIDER is no longer read by the server",
      fix: "Rename it to PARMANA_STORAGE, and remove DATABASE_PROVIDER",
    });
    return;
  }
  try {
    const provider = parseStorageProvider(env.PARMANA_STORAGE);
    if (provider === "memory") {
      add({
        name,
        level: "warn",
        message:
          "memory storage: state is lost when the process stops. Use it for local work only",
      });
    } else {
      add({
        name,
        level: "warn",
        message: `${provider} storage is checked by the production stage of this doctor, not yet`,
        fix: "Run the production checks once they are available",
      });
    }
  } catch {
    add({
      name,
      level: "fail",
      message: `${name} has an unsupported value`,
      fix: `Use one of: memory, postgres, supabase`,
    });
  }
}

function checkCrypto(env: Env, add: (check: DoctorCheck) => void): void {
  parseOrFail(
    add,
    "CRYPTO_MODE",
    () => parseCryptoMode(env.CRYPTO_MODE),
    Object.values(CryptoModes),
  );
  parseOrFail(
    add,
    "HASH_PROVIDER",
    () => parseHashAlgorithm(env.HASH_PROVIDER),
    Object.values(HashAlgorithms),
  );
  parseOrFail(
    add,
    "PRIMARY_SIGNATURE_PROVIDER",
    () => parseSignatureAlgorithm(env.PRIMARY_SIGNATURE_PROVIDER),
    signatureNames(),
  );
  if (
    env.SECONDARY_SIGNATURE_PROVIDER !== undefined &&
    env.SECONDARY_SIGNATURE_PROVIDER !== ""
  ) {
    parseOrFail(
      add,
      "SECONDARY_SIGNATURE_PROVIDER",
      () =>
        parseSignatureAlgorithm(
          env.SECONDARY_SIGNATURE_PROVIDER,
          "SECONDARY_SIGNATURE_PROVIDER",
        ),
      signatureNames(),
    );
  }

  try {
    const provider = parseKeyProvider(env.KEY_PROVIDER);
    if (provider !== KeyProviders.LOCAL) {
      add({
        name: "KEY_PROVIDER",
        level: "warn",
        message: `${provider} keys are checked by the production stage of this doctor, not yet`,
      });
    } else {
      add({ name: "KEY_PROVIDER", level: "pass", message: "local key files" });
    }
  } catch {
    add({
      name: "KEY_PROVIDER",
      level: "fail",
      message: "KEY_PROVIDER has an unsupported value",
      fix: "Use local for local work. Other providers are not implemented in this build",
    });
  }
}

function checkHybrid(env: Env, add: (check: DoctorCheck) => void): void {
  try {
    parseHybridSchemaVersion(
      env.HYBRID_SCHEMA_VERSION,
      env.HYBRID_SCHEMA_V3_ACKNOWLEDGED,
    );
    add({
      name: "HYBRID_SCHEMA_VERSION",
      level: "pass",
      message: "schema version is valid",
    });
  } catch {
    add({
      name: "HYBRID_SCHEMA_VERSION",
      level: "fail",
      message:
        "HYBRID_SCHEMA_VERSION must be 2 or 3. Version 3 also needs HYBRID_SCHEMA_V3_ACKNOWLEDGED=true",
      fix: "Set HYBRID_SCHEMA_VERSION to 2, or set both values for version 3 (ADR-0016)",
    });
  }

  try {
    parseHybridRequiredFrom(env.HYBRID_REQUIRED_FROM);
  } catch {
    add({
      name: "HYBRID_REQUIRED_FROM",
      level: "fail",
      message:
        "HYBRID_REQUIRED_FROM must be an ISO-8601 UTC timestamp ending in Z",
      fix: "Use a value such as 2026-12-01T00:00:00Z, or leave it unset",
    });
  }

  if (
    env.HYBRID_SIGNATURE_REQUIRED === "true" &&
    env.CRYPTO_MODE !== "hybrid"
  ) {
    add({
      name: "HYBRID_SIGNATURE_REQUIRED",
      level: "warn",
      message:
        "HYBRID_SIGNATURE_REQUIRED=true has no effect unless CRYPTO_MODE=hybrid",
      fix: "Set CRYPTO_MODE=hybrid, or remove HYBRID_SIGNATURE_REQUIRED",
    });
  }
}

function checkKeys(
  env: Env,
  readers: DoctorReaders,
  add: (check: DoctorCheck) => void,
): void {
  const name = "PARMANA_KEY_DIR";
  const dir = env.PARMANA_KEY_DIR;
  if (dir === undefined || dir.trim() === "") {
    add({
      name,
      level: "fail",
      message: `${name} is not set`,
      fix: `Set ${name} to the folder that holds the key files, for example ./keys`,
    });
    return;
  }

  const materialSet =
    env.PARMANA_KEY_MATERIAL_JSON !== undefined &&
    env.PARMANA_KEY_MATERIAL_JSON.trim() !== "";
  if (materialSet) {
    try {
      const parsed: unknown = JSON.parse(
        env.PARMANA_KEY_MATERIAL_JSON as string,
      );
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        throw new Error("not an object");
      add({
        name: "PARMANA_KEY_MATERIAL_JSON",
        level: "pass",
        message: "valid JSON. Its contents are not printed",
      });
    } catch {
      add({
        name: "PARMANA_KEY_MATERIAL_JSON",
        level: "fail",
        message:
          "PARMANA_KEY_MATERIAL_JSON is not a JSON object keyed by key ID",
        fix: 'Use { "<keyId>": { "privateKeyPem": "...", "publicKeyPem": "..." } }',
      });
    }
  }

  const publicPath = `${dir}/${DEFAULT_KEY_ID}.public.pem`;
  const present =
    readers.directoryExists(dir) &&
    readers.listDirectory(dir).includes(`${DEFAULT_KEY_ID}.private.pem`) &&
    readers.listDirectory(dir).includes(`${DEFAULT_KEY_ID}.public.pem`);

  if (present) {
    checkPublicKeyFile(publicPath, readers, add);
    add({
      name: "default key pair",
      level: "pass",
      message: `the default key pair is in ${name}`,
    });
  } else if (materialSet) {
    add({
      name: "default key pair",
      level: "warn",
      message: `the default key pair is not in ${name} yet. The server writes it from PARMANA_KEY_MATERIAL_JSON at startup`,
    });
  } else {
    add({
      name: "default key pair",
      level: "fail",
      message: `the default key pair is missing from ${name}. The server refuses to start without it`,
      fix: `Generate or copy ${DEFAULT_KEY_ID}.private.pem and ${DEFAULT_KEY_ID}.public.pem into ${name}, or set PARMANA_KEY_MATERIAL_JSON`,
    });
  }

  if (env.CRYPTO_MODE === "hybrid") {
    add({
      name: "hybrid key pairs",
      level: "warn",
      message:
        "the server checks the hybrid key pairs at startup. This doctor checks only the default key pair",
      fix: "Start the server once to confirm the hybrid keys",
    });
  }
}

/** A public key file must parse as a key and must not hold a private key. */
function checkPublicKeyFile(
  path: string,
  readers: DoctorReaders,
  add: (check: DoctorCheck) => void,
): void {
  let text: string;
  try {
    text = readers.readFile(path);
  } catch {
    add({
      name: "default public key",
      level: "fail",
      message: "the default public key cannot be read",
      fix: "Check the file permissions in PARMANA_KEY_DIR",
    });
    return;
  }
  if (/PRIVATE KEY/.test(text)) {
    add({
      name: "default public key",
      level: "fail",
      message: "the default public key file holds a private key",
      fix: "Replace it with the public key. Treat the private key as compromised",
    });
    return;
  }
  try {
    createPublicKey(text);
    add({
      name: "default public key",
      level: "pass",
      message: "readable as a public key",
    });
  } catch {
    add({
      name: "default public key",
      level: "fail",
      message: "the default public key file is not a valid PEM public key",
      fix: "Regenerate the key pair",
    });
  }
}

function checkPolicy(
  env: Env,
  readers: DoctorReaders,
  add: (check: DoctorCheck) => void,
): void {
  const name = "PARMANA_POLICY_DIR";
  const dir = env.PARMANA_POLICY_DIR;
  if (dir === undefined || dir.trim() === "") {
    add({
      name,
      level: "fail",
      message: `${name} is not set. The server refuses to start without it`,
      fix: `Set ${name} to the folder that holds the policy files, for example ./policies`,
    });
    return;
  }
  if (!readers.directoryExists(dir)) {
    add({
      name,
      level: "fail",
      message: `${name} points to a folder that does not exist`,
      fix: `Create the folder, or correct ${name}`,
    });
    return;
  }
  if (readers.listDirectory(dir).length === 0) {
    add({
      name,
      level: "warn",
      message: `${name} is empty. Any request that names a policy will fail with PolicyNotFound`,
      fix: "Add the policy files to the folder",
    });
    return;
  }
  add({
    name,
    level: "pass",
    message: `${name} exists and holds policy files`,
  });
}

function checkAuth(env: Env, add: (check: DoctorCheck) => void): void {
  if (env.PARMANA_AUTH_DISABLED === "true") {
    add({
      name: "PARMANA_AUTH_DISABLED",
      level: "warn",
      message: "authentication is disabled. Acceptable only on a local machine",
      fix: "Set PARMANA_AUTH_DISABLED to false, and configure PARMANA_API_KEYS",
    });
  }
  try {
    const keys = parseApiKeys(env.PARMANA_API_KEYS);
    if (keys.length === 0 && env.PARMANA_AUTH_DISABLED !== "true") {
      add({
        name: "PARMANA_API_KEYS",
        level: "fail",
        message:
          "no API keys are configured. The server refuses to start unless authentication is disabled",
        fix: 'Set PARMANA_API_KEYS to a JSON array of { "callerId", "keyHash" } entries',
      });
    } else if (keys.length > 0) {
      add({
        name: "PARMANA_API_KEYS",
        level: "pass",
        message: `${keys.length} API key entr${keys.length === 1 ? "y" : "ies"} configured`,
      });
    }
  } catch {
    add({
      name: "PARMANA_API_KEYS",
      level: "fail",
      message:
        "PARMANA_API_KEYS is not a valid JSON array of { callerId, keyHash } entries",
      fix: "Correct the JSON. Each keyHash is a 64-character lowercase hex SHA-256",
    });
  }
}

function checkTrustProfile(env: Env, add: (check: DoctorCheck) => void): void {
  parseOrFail(
    add,
    "TRUST_PROFILE",
    () => parseTrustProfile(env.TRUST_PROFILE),
    ["v1"],
  );
}

/**
 * Numbers are read with Number() and never validated by the server, so a typo
 * becomes NaN and is used as is. Doctor is the one place that catches it.
 */
function checkNumbers(env: Env, add: (check: DoctorCheck) => void): void {
  const numbers: Array<{ name: string; fallback: number; min: number }> = [
    { name: "PORT", fallback: 3000, min: 1 },
    { name: "EXECUTION_AUTHORIZATION_TTL_SECONDS", fallback: 120, min: 1 },
    { name: "RATE_LIMIT_EXECUTE_PER_MINUTE", fallback: 30, min: 1 },
    { name: "RATE_LIMIT_HEALTH_PER_MINUTE", fallback: 300, min: 1 },
    { name: "RATE_LIMIT_PUBLIC_PER_MINUTE", fallback: 60, min: 1 },
    { name: "RATE_LIMIT_AUTH_FAILURE_PER_MINUTE", fallback: 30, min: 1 },
  ];
  for (const { name, fallback, min } of numbers) {
    const raw = env[name];
    if (raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) {
      add({
        name,
        level: "fail",
        message: `${name} must be a whole number of at least ${min}`,
        fix: `Set ${name} to a whole number, or remove it to use the default (${fallback})`,
      });
    }
  }
}

/**
 * A PARMANA_ name no code reads is almost always a typo, and the server ignores
 * it silently. Each one is reported with the closest real name, and its value
 * is never printed.
 */
function checkUnknownSettings(
  env: Env,
  add: (check: DoctorCheck) => void,
): void {
  const known = new Set(KNOWN_PARMANA_SETTINGS);
  for (const key of Object.keys(env)) {
    if (!key.startsWith("PARMANA_") || known.has(key) || env[key] === undefined)
      continue;
    const closest = closestSetting(key);
    add({
      name: key,
      level: "warn",
      message:
        closest === undefined
          ? `${key} is not read by any Parmana component, so it has no effect`
          : `${key} is not read by any Parmana component. Did you mean ${closest}?`,
      fix:
        closest === undefined
          ? "Remove it, or correct its name"
          : `Rename ${key} to ${closest}, or remove it`,
    });
  }
}

function parseOrFail(
  add: (check: DoctorCheck) => void,
  name: string,
  parse: () => unknown,
  allowed: readonly string[],
): void {
  try {
    parse();
    add({ name, level: "pass", message: `${name} is valid` });
  } catch {
    add({
      name,
      level: "fail",
      message: `${name} has an unsupported value`,
      fix: `Use one of: ${allowed.join(", ")}`,
    });
  }
}

function signatureNames(): readonly string[] {
  return [...Object.values(SignatureAlgorithms), "ml-dsa-65"];
}

/** The known setting within two edits of the given name, if there is one. */
export function closestSetting(name: string): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of KNOWN_PARMANA_SETTINGS) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min(
          (current[j - 1] ?? 0) + 1,
          (previous[j] ?? 0) + 1,
          (previous[j - 1] ?? 0) + cost,
        ),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
