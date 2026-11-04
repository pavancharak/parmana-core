import { createPublicKey } from "node:crypto";

import { parseHybridRequiredFrom, parseHybridSchemaVersion } from "./Config.js";
import {
  CryptoModes,
  HashAlgorithms,
  SignatureAlgorithms,
} from "./CryptoAlgorithms.js";
import { KeyProviders } from "./KeyProviders.js";
import { SecretsProviders } from "./SecretsProviders.js";
import {
  parseApiKeys,
  parseCryptoMode,
  parseHashAlgorithm,
  parseKeyProvider,
  parseSecretsProvider,
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

export interface DoctorOptions {
  /**
   * Apply the production rules as well. The server refuses several settings
   * when NODE_ENV=production, and some storage and key choices are only valid
   * in production. Without this, the local rules apply.
   */
  readonly production: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The key pair the server requires for every signing operation. It is the same
 * name the signing code uses (DEFAULT_KEY_ID in @parmana/crypto). That package
 * depends on this one, so the name is repeated here rather than imported.
 */
const DEFAULT_KEY_ID = "default";

/** A plain Postgres schema name, as PostgresPoolFactory accepts. */
const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

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
  "PARMANA_DATABASE_CA_FILE",
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
 * Runs the configuration checks and returns every result, not just the first
 * failure. With `production: true`, the production rules are added and the
 * stage 1 "not yet checked" warnings are replaced by real checks.
 *
 * Each setting is checked with the same parser the server uses, so a check
 * cannot pass here and fail at startup. Parser error messages are never shown,
 * because some of them echo the value they rejected. Messages name the setting
 * and the allowed values only.
 */
export function diagnoseConfiguration(
  env: Env,
  readers: DoctorReaders,
  options: DoctorOptions = { production: false },
): DoctorCheck[] {
  const production = options.production;
  const checks: DoctorCheck[] = [];
  const add = (check: DoctorCheck) => checks.push(check);

  checkStorage(env, add, production);
  checkDatabaseCaFile(env, readers, add);
  checkCrypto(env, add, production);
  checkHybrid(env, add);
  const keyProvider = keyProviderOf(env);
  checkKeys(env, readers, add, keyProvider);
  checkPolicy(env, readers, add);
  checkAuth(env, add, production);
  checkTrustProfile(env, add);
  checkNumbers(env, add);
  checkUnknownSettings(env, add);

  if (production) {
    checkProduction(env, add, keyProvider);
  }

  return checks;
}

function keyProviderOf(env: Env): string {
  try {
    return parseKeyProvider(env.KEY_PROVIDER);
  } catch {
    return KeyProviders.LOCAL;
  }
}

function checkStorage(
  env: Env,
  add: (check: DoctorCheck) => void,
  production: boolean,
): void {
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

  let provider: string;
  try {
    provider = parseStorageProvider(env.PARMANA_STORAGE);
  } catch {
    add({
      name,
      level: "fail",
      message: `${name} has an unsupported value`,
      fix: "Use one of: memory, postgres, supabase",
    });
    return;
  }

  if (provider === "memory") {
    if (production) {
      add({
        name,
        level: "fail",
        message:
          "memory storage is not durable, so it is not a production configuration",
        fix: "Set PARMANA_STORAGE to postgres (or supabase), and set DATABASE_URL",
      });
    } else {
      add({
        name,
        level: "warn",
        message:
          "memory storage: state is lost when the process stops. Use it for local work only",
      });
    }
  } else {
    add({ name, level: "pass", message: `${name} is ${provider}` });
    checkDatabaseUrl(env, add);
    if (
      provider === "supabase" &&
      (env.SUPABASE_URL === undefined || env.SUPABASE_URL === "")
    ) {
      add({
        name: "SUPABASE_URL",
        level: "warn",
        message:
          "SUPABASE_URL is not set. The Supabase client settings are read by the nonce and audit stores",
        fix: "Set SUPABASE_URL to the project URL",
      });
    }
  }

  const schema = env.PARMANA_DB_SCHEMA;
  if (schema !== undefined && schema !== "" && !SCHEMA_NAME.test(schema)) {
    add({
      name: "PARMANA_DB_SCHEMA",
      level: "fail",
      message: "PARMANA_DB_SCHEMA must be a plain Postgres name",
      fix: "Use a lowercase name, such as parmana_sandbox",
    });
  }
}

/**
 * PARMANA_DATABASE_CA_FILE: the CA certificate the database is verified against.
 * Checked here as the pool checks it: readable, and holds a certificate. When it
 * is set, an sslmode in DATABASE_URL is ignored, and the doctor says so.
 */
function checkDatabaseCaFile(
  env: Env,
  readers: DoctorReaders,
  add: (check: DoctorCheck) => void,
): void {
  const path = env.PARMANA_DATABASE_CA_FILE;
  if (path === undefined || path.trim() === "") return;

  let pem: string;
  try {
    pem = readers.readFile(path);
  } catch {
    add({
      name: "PARMANA_DATABASE_CA_FILE",
      level: "fail",
      message: "the CA file cannot be read",
      fix: "Check the path, and that the service can read the file",
    });
    return;
  }
  if (!pem.includes("-----BEGIN CERTIFICATE-----")) {
    add({
      name: "PARMANA_DATABASE_CA_FILE",
      level: "fail",
      message: "the file does not hold a PEM certificate",
      fix: "Download the database's root certificate again. Do not use a private key file",
    });
    return;
  }
  add({
    name: "PARMANA_DATABASE_CA_FILE",
    level: "pass",
    message: "the database certificate is verified against this CA",
  });
  const sslmode = /[?&]sslmode=/.exec(env.DATABASE_URL ?? "");
  if (sslmode !== null) {
    add({
      name: "DATABASE_URL",
      level: "warn",
      message:
        "sslmode in DATABASE_URL is ignored while PARMANA_DATABASE_CA_FILE is set. The CA file decides the TLS settings",
      fix: "Remove sslmode from DATABASE_URL to avoid confusion",
    });
  }
}

/**
 * DATABASE_URL is required for postgres and supabase storage. Its value is never
 * printed, because it holds a password. The check reads the scheme only.
 */
function checkDatabaseUrl(env: Env, add: (check: DoctorCheck) => void): void {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    add({
      name: "DATABASE_URL",
      level: "fail",
      message:
        "DATABASE_URL is not set, and postgres and supabase storage need it",
      fix: "Set DATABASE_URL to the connection string of the database. It holds a password, so never share it",
    });
    return;
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    add({
      name: "DATABASE_URL",
      level: "fail",
      message: "DATABASE_URL does not start with postgres:// or postgresql://",
      fix: "Correct the scheme of the connection string",
    });
    return;
  }
  if (!/[?&]sslmode=/.test(url)) {
    add({
      name: "DATABASE_URL",
      level: "warn",
      message:
        "DATABASE_URL does not set sslmode. Confirm the connection is encrypted",
      fix: "Add sslmode=require to the connection string if the database supports TLS",
    });
    return;
  }
  add({
    name: "DATABASE_URL",
    level: "pass",
    message: "DATABASE_URL is set with a postgres scheme and sslmode",
  });
}

function checkCrypto(
  env: Env,
  add: (check: DoctorCheck) => void,
  production: boolean,
): void {
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

  let provider: string;
  try {
    provider = parseKeyProvider(env.KEY_PROVIDER);
  } catch {
    add({
      name: "KEY_PROVIDER",
      level: "fail",
      message: "KEY_PROVIDER has an unsupported value",
      fix: "Use local, or aws-kms for production. Other providers are not implemented in this build",
    });
    return;
  }

  if (provider === KeyProviders.AWS_KMS) {
    if (env.CRYPTO_MODE === "hybrid") {
      add({
        name: "KEY_PROVIDER",
        level: "fail",
        message:
          "CRYPTO_MODE=hybrid is not supported with KEY_PROVIDER=aws-kms",
        fix: "Use CRYPTO_MODE=single with KMS, or KEY_PROVIDER=local for hybrid signing",
      });
      return;
    }
    if (production) {
      if (env.AWS_REGION === undefined || env.AWS_REGION.trim() === "") {
        add({
          name: "AWS_REGION",
          level: "fail",
          message: "AWS_REGION is not set, and KMS signing needs it",
          fix: "Set AWS_REGION to the region of the KMS key",
        });
      } else {
        add({
          name: "AWS_REGION",
          level: "pass",
          message: "AWS_REGION is set",
        });
      }
      add({
        name: "KEY_PROVIDER",
        level: "pass",
        message: env.AWS_ROLE_ARN
          ? "aws-kms, with AWS_ROLE_ARN for short-lived credentials"
          : "aws-kms. No AWS_ROLE_ARN is set, so credentials come from the environment",
      });
    } else {
      add({
        name: "KEY_PROVIDER",
        level: "warn",
        message: "aws-kms: the KMS settings are checked with --production",
        fix: "Run npm run doctor -- --production",
      });
    }
    return;
  }

  add({ name: "KEY_PROVIDER", level: "pass", message: "local key files" });
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
  keyProvider: string,
): void {
  const name = "PARMANA_KEY_DIR";
  const dir = env.PARMANA_KEY_DIR;
  // The server requires this folder under every key provider, so the check does too.
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

  // With KMS the default private key never leaves KMS, so there is no local file to check.
  if (keyProvider === KeyProviders.AWS_KMS) {
    add({
      name: "default key pair",
      level: "pass",
      message:
        "held in AWS KMS. Its reachability is checked with --online (stage 3)",
    });
    return;
  }

  const publicPath = `${dir}/${DEFAULT_KEY_ID}.public.pem`;
  const files = readers.directoryExists(dir) ? readers.listDirectory(dir) : [];
  const present =
    files.includes(`${DEFAULT_KEY_ID}.private.pem`) &&
    files.includes(`${DEFAULT_KEY_ID}.public.pem`);

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

function checkAuth(
  env: Env,
  add: (check: DoctorCheck) => void,
  production: boolean,
): void {
  // In production the production rules report this as a failure instead.
  if (env.PARMANA_AUTH_DISABLED === "true" && !production) {
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
  const numbers: Array<{ name: string; fallback: number }> = [
    { name: "PORT", fallback: 3000 },
    { name: "EXECUTION_AUTHORIZATION_TTL_SECONDS", fallback: 120 },
    { name: "RATE_LIMIT_EXECUTE_PER_MINUTE", fallback: 30 },
    { name: "RATE_LIMIT_HEALTH_PER_MINUTE", fallback: 300 },
    { name: "RATE_LIMIT_PUBLIC_PER_MINUTE", fallback: 60 },
    { name: "RATE_LIMIT_AUTH_FAILURE_PER_MINUTE", fallback: 30 },
  ];
  for (const { name, fallback } of numbers) {
    const raw = env[name];
    if (raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      add({
        name,
        level: "fail",
        message: `${name} must be a whole number of at least 1`,
        fix: `Set ${name} to a whole number, or remove it to use the default (${fallback})`,
      });
    }
  }
}

/**
 * Production rules. Each one mirrors a refusal the server already makes, or a
 * setting the production deployment needs. The server enforces them at startup
 * or on the first request; this reports them before the first start.
 */
function checkProduction(
  env: Env,
  add: (check: DoctorCheck) => void,
  keyProvider: string,
): void {
  if (env.NODE_ENV !== "production") {
    add({
      name: "NODE_ENV",
      level: "warn",
      message:
        "NODE_ENV is not production. Production refusals apply only when NODE_ENV=production",
      fix: "Set NODE_ENV=production for the production deployment",
    });
  } else {
    add({ name: "NODE_ENV", level: "pass", message: "NODE_ENV is production" });
  }

  if (env.PARMANA_AUTH_DISABLED === "true") {
    add({
      name: "production: PARMANA_AUTH_DISABLED",
      level: "fail",
      message: "authentication cannot be disabled in production",
      fix: "Set PARMANA_AUTH_DISABLED to false, and configure PARMANA_API_KEYS",
    });
  }

  if (env.PARMANA_SANDBOX === "true") {
    add({
      name: "PARMANA_SANDBOX",
      level: "fail",
      message: "the sandbox is refused in production",
      fix: "Set PARMANA_SANDBOX to false, or remove it",
    });
  }

  const killSwitch = env.KILL_SWITCH_ENABLED;
  if (
    killSwitch === undefined ||
    killSwitch.trim() === "" ||
    killSwitch === "false"
  ) {
    add({
      name: "KILL_SWITCH_ENABLED",
      level: "warn",
      message: "the kill switch is off. Production sets it to true (ADR-0017)",
      fix: "Set KILL_SWITCH_ENABLED=true",
    });
  } else if (killSwitch !== "true") {
    add({
      name: "KILL_SWITCH_ENABLED",
      level: "fail",
      message: 'KILL_SWITCH_ENABLED must be "true" or "false"',
      fix: 'Set it to "true" for production',
    });
  } else {
    const twoPerson = env.KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR;
    if (twoPerson !== "true" && twoPerson !== "false") {
      add({
        name: "KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR",
        level: "fail",
        message: "must be stated as true or false when the kill switch is on",
        fix: 'Set it to "true" for production (ADR-0017 decision 1)',
      });
    } else {
      add({
        name: "KILL_SWITCH_ENABLED",
        level: "pass",
        message: `the kill switch is on, with a second operator required to reset: ${twoPerson}`,
      });
    }
  }

  try {
    const secrets = parseSecretsProvider(env.PARMANA_SECRETS_PROVIDER);
    if (
      secrets === SecretsProviders.AWS_SECRETS_MANAGER &&
      (env.AWS_REGION === undefined || env.AWS_REGION.trim() === "")
    ) {
      add({
        name: "PARMANA_SECRETS_PROVIDER",
        level: "fail",
        message: "aws-secrets-manager needs AWS_REGION",
        fix: "Set AWS_REGION to the region of the secret store",
      });
    } else {
      add({
        name: "PARMANA_SECRETS_PROVIDER",
        level: "pass",
        message: `secrets come from ${secrets}`,
      });
    }
  } catch {
    add({
      name: "PARMANA_SECRETS_PROVIDER",
      level: "fail",
      message: "PARMANA_SECRETS_PROVIDER has an unsupported value",
      fix: "Use env, or aws-secrets-manager",
    });
  }

  if (
    env.PARMANA_KEY_MATERIAL_JSON !== undefined &&
    env.PARMANA_KEY_MATERIAL_JSON.trim() !== ""
  ) {
    add({
      name: "production: PARMANA_KEY_MATERIAL_JSON",
      level: "warn",
      message:
        "keys are written at startup from an environment variable. That is a fallback for platforms without a secret mount",
      fix: "Prefer a mounted secret file, or KEY_PROVIDER=aws-kms",
    });
  }

  if (keyProvider === KeyProviders.LOCAL) {
    add({
      name: "production: KEY_PROVIDER",
      level: "warn",
      message:
        "signing keys are local files. Production is designed for aws-kms",
      fix: "Confirm the key files are on a protected volume, or move to KEY_PROVIDER=aws-kms",
    });
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
