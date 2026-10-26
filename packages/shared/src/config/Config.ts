import dotenv from "dotenv";

import { existsSync } from "node:fs";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";

import type {
  CryptoMode,
  HashAlgorithm,
  SignatureAlgorithm,
} from "./CryptoAlgorithms.js";

import type { StorageProvider } from "./StorageProviders.js";

import { optionalProperty } from "./ConfigUtils.js";

import type { KeyProvider } from "./KeyProviders.js";

import type { SecretsProvider } from "./SecretsProviders.js";

import type { TrustProfile } from "./TrustProfiles.js";

import type { ApiKeyEntry } from "./ApiKeyEntry.js";

import {
  parseStorageProvider,
  parseCryptoMode,
  parseHashAlgorithm,
  parseSignatureAlgorithm,
  parseKeyProvider,
  parseSecretsProvider,
  parseTrustProfile,
  parseApiKeys,
} from "./ConfigValidation.js";

/**
 * Resolve the repository .env file.
 *
 * This implementation is independent of the
 * current working directory, allowing every
 * Parmana package to share the same
 * configuration.
 */
const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

function findEnvFile(): string | undefined {
  let current = __dirname;

  while (true) {
    const candidate = join(current, ".env");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

//
// The .env file is read on first use of loadConfig(), not when this module
// is imported. Importing a package (for example the offline verifier) then
// reads no file from the working tree.
//
let dotEnvLoaded = false;

function loadDotEnvOnce(): void {
  // Test runs set PARMANA_SKIP_DOTENV so a local .env cannot leak into them.
  if (dotEnvLoaded || process.env.PARMANA_SKIP_DOTENV === "1") {
    return;
  }

  dotEnvLoaded = true;

  const envFile = findEnvFile();

  if (envFile) {
    dotenv.config({
      path: envFile,
      quiet: true,
    });
  } else {
    dotenv.config({ quiet: true });
  }
}

/**
 * Fail-closed by design, same discipline as caller authentication
 * (see createCallerAuthenticator.ts): refuses to start rather than let
 * an unset policy directory surface later as a raw filesystem error
 * (ERR_INVALID_ARG_TYPE from path.join(undefined, ...)) inside
 * FilePolicyRepository.load at request time.
 */
function requirePolicyDirectory(): string {
  const directory = process.env.PARMANA_POLICY_DIR;

  if (directory === undefined || directory.trim() === "") {
    throw new Error(
      "PARMANA_POLICY_DIR is not set. Refusing to start without a " +
        "configured policy directory; the server cannot load or evaluate " +
        "policies without it. Set PARMANA_POLICY_DIR to the directory " +
        "containing policy files (e.g. ./policies).",
    );
  }

  return directory;
}

/**
 * Parmana Configuration.
 *
 * Centralized immutable configuration.
 *
 * This is the only configuration model used by
 * Parmana. Environment variables are converted
 * into strongly typed values through the
 * ConfigValidation module.
 */

/**
 * Root configuration.
 */
export interface Config {
  readonly environment: EnvironmentConfig;

  readonly storage: StorageConfig;

  readonly crypto: CryptoConfig;

  readonly keys: KeyConfig;

  readonly secrets: SecretsConfig;

  readonly authorization: AuthorizationConfig;

  readonly policy: PolicyConfig;

  readonly trust: TrustConfig;

  readonly api: ApiConfig;

  readonly auth: ApiAuthConfig;

  readonly rateLimit: RateLimitConfig;

  readonly logging: LoggingConfig;
}
/**
 * Runtime environment.
 */
export interface EnvironmentConfig {
  readonly nodeEnv: string;
}

/**
 * Storage configuration.
 */
export interface StorageConfig {
  readonly provider: StorageProvider;

  readonly databaseUrl?: string;
}

/**
 * Cryptographic configuration.
 */
export interface CryptoConfig {
  /**
   * Crypto operating mode.
   */
  readonly mode: CryptoMode;

  /**
   * Hash algorithm.
   */
  readonly hashProvider: HashAlgorithm;

  /**
   * Primary signature algorithm.
   */
  readonly primarySignatureProvider: SignatureAlgorithm;

  /**
   * Secondary signature algorithm.
   *
   * Required only in hybrid mode.
   */
  readonly secondarySignatureProvider?: SignatureAlgorithm;

  /**
   * When true, verification of a hybrid-schema-capable artifact
   * (an ExecutionTrustRecord) MUST find a valid `signatures` array
   * covering every configured algorithm -- a record with `signatures`
   * absent, empty, or partial is rejected outright, never silently
   * verified via the legacy single signature alone.
   *
   * Off by default so no already-issued record (hybrid or not) is
   * affected by turning CRYPTO_MODE=hybrid on: a deployment opts into
   * this once it is confident every record going forward is genuinely
   * hybrid-signed. See VerificationCrypto.verifySignature()'s own
   * comment for the exact downgrade this closes.
   */
  readonly requireHybridSignature: boolean;

  /**
   * Cutover (ADR-0016, option 2): a record created at or after this ISO-8601
   * UTC instant must carry a valid hybrid envelope. Unset means no cutover.
   * The same instant belongs in the offline verifier's trust file.
   */
  readonly hybridRequiredFrom?: string;

  /**
   * Schema version that hybrid signatures are made under (ADR-0016).
   *
   * 2 (default) signs the canonical fields plus schemaVersion. 3 signs
   * every top-level field except the signature envelope and the
   * post-signing fields (verifications, receipts). Records made under 3
   * are not readable by verifiers that implement only version 2, so
   * switch to 3 only once those consumers are updated.
   */
  readonly hybridSchemaVersion: 2 | 3;
}
/**
 * Key management.
 */
export interface KeyConfig {
  readonly provider: KeyProvider;

  /**
   * Root directory containing all Parmana keys.
   */
  readonly keyDirectory: string;
}
/**
 * Secrets backend configuration (ADR-0009). Selects where connector
 * credentials that are opaque bearer values -- not signing keys, see
 * KeyConfig/Signer for those -- are resolved from at request time.
 * "env" (default) is an identity pass-through: the value each
 * connector's own env var already holds IS the secret. In
 * "aws-secrets-manager" mode, that same env var's value is instead
 * treated as the Secrets Manager secret's name/ARN to fetch.
 */
export interface SecretsConfig {
  readonly provider: SecretsProvider;
}

/**
 * Execution authorization configuration.
 */
export interface AuthorizationConfig {
  /**
   * Default TTL, in seconds, applied to a signed
   * Execution Authorization when the caller does
   * not specify one.
   */
  readonly ttlSeconds: number;
}
/**
 * Policy configuration.
 */
export interface PolicyConfig {
  /**
   * Root directory containing policy files.
   */
  readonly directory: string;
}

/**
 * Trust profile configuration.
 */
export interface TrustConfig {
  readonly profile: TrustProfile;

  readonly receiptVersion: string;
}

/**
 * API configuration.
 */
export interface ApiConfig {
  readonly port: number;
}

/**
 * API caller authentication.
 *
 * Fail-closed by design: an empty `keys` array means the
 * caller-authenticator bootstrap refuses to start the
 * server unless `disabled` is explicitly true (local
 * development and tutorials only).
 */
export interface ApiAuthConfig {
  readonly keys: readonly ApiKeyEntry[];

  readonly disabled: boolean;
}

/**
 * Rate limiting configuration.
 *
 * Both are per-caller/per-IP-per-minute ceilings applied by
 * packages/api/src/middleware/rate-limit.ts; see that file for exactly
 * where and how each is keyed.
 */
export interface RateLimitConfig {
  /**
   * POST /execute, keyed by authenticated caller identity.
   */
  readonly executePerMinute: number;

  /**
   * GET /health and GET /ready, keyed by IP.
   */
  readonly healthPerMinute: number;

  /**
   * The unauthenticated verify routes, /handbook and key discovery,
   * keyed by IP (G-78).
   */
  readonly publicPerMinute: number;

  /**
   * Failed caller authentications (401) on every authenticated route,
   * keyed by IP. Each one writes a signed audit event, so an unlimited
   * stream of bad keys would spend signing capacity real requests need.
   */
  readonly authFailurePerMinute: number;
}

/**
 * Logging configuration.
 */
export interface LoggingConfig {
  readonly level: string;
}

/**
 * Loads the immutable Parmana configuration.
 *
 * This is the only location where process.env
 * should be accessed.
 */
/**
 * HYBRID_SCHEMA_VERSION: unset means 2. Any other value must be exactly
 * 2 or 3, and anything else throws, so a typo cannot pick a schema
 * version silently.
 */
function parseHybridSchemaVersion(
  value: string | undefined,
  acknowledged: string | undefined,
): 2 | 3 {
  if (value === undefined || value.trim() === "") {
    return 2;
  }

  if (value === "2") {
    return 2;
  }

  if (value === "3") {
    //
    // Schema version 3 records are not readable by the SDKs and by
    // the published third-party verifier until those are updated (ADR-0016 issuance gate).
    // Refuse to start unless the operator also sets the acknowledgement,
    // so a stray value cannot switch v3 on.
    //
    if (acknowledged !== "true") {
      throw new Error(
        "HYBRID_SCHEMA_VERSION=3 is refused unless HYBRID_SCHEMA_V3_ACKNOWLEDGED=true is also set (ADR-0016 issuance gate).",
      );
    }

    return 3;
  }

  throw new Error(`HYBRID_SCHEMA_VERSION must be 2 or 3, got "${value}".`);
}

/**
 * HYBRID_REQUIRED_FROM: unset or blank means no cutover. Otherwise it must be
 * an ISO-8601 UTC timestamp ending in "Z", so it means the same time everywhere.
 */
function parseHybridRequiredFrom(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  if (!value.endsWith("Z") || Number.isNaN(Date.parse(value))) {
    throw new Error(
      `HYBRID_REQUIRED_FROM must be an ISO-8601 UTC timestamp ending in "Z", got "${value}".`,
    );
  }

  return value;
}

export function loadConfig(): Readonly<Config> {
  loadDotEnvOnce();

  return Object.freeze({
    environment: Object.freeze({
      nodeEnv: process.env.NODE_ENV ?? "development",
    }),

    storage: Object.freeze({
      provider: parseStorageProvider(process.env.PARMANA_STORAGE),

      ...optionalProperty("databaseUrl", process.env.DATABASE_URL),
    }),

    crypto: Object.freeze({
      mode: parseCryptoMode(process.env.CRYPTO_MODE),

      hashProvider: parseHashAlgorithm(process.env.HASH_PROVIDER),

      primarySignatureProvider: parseSignatureAlgorithm(
        process.env.PRIMARY_SIGNATURE_PROVIDER,
      ),

      ...optionalProperty(
        "secondarySignatureProvider",
        process.env.SECONDARY_SIGNATURE_PROVIDER
          ? parseSignatureAlgorithm(process.env.SECONDARY_SIGNATURE_PROVIDER)
          : undefined,
      ),

      requireHybridSignature: process.env.HYBRID_SIGNATURE_REQUIRED === "true",

      ...optionalProperty(
        "hybridRequiredFrom",
        parseHybridRequiredFrom(process.env.HYBRID_REQUIRED_FROM),
      ),

      hybridSchemaVersion: parseHybridSchemaVersion(
        process.env.HYBRID_SCHEMA_VERSION,
        process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED,
      ),
    }),

    keys: Object.freeze({
      provider: parseKeyProvider(process.env.KEY_PROVIDER),

      keyDirectory: process.env.PARMANA_KEY_DIR!,
    }),

    secrets: Object.freeze({
      provider: parseSecretsProvider(process.env.PARMANA_SECRETS_PROVIDER),
    }),

    authorization: Object.freeze({
      ttlSeconds: Number(
        process.env.EXECUTION_AUTHORIZATION_TTL_SECONDS ?? 120,
      ),
    }),
    policy: Object.freeze({
      directory: requirePolicyDirectory(),
    }),

    trust: Object.freeze({
      profile: parseTrustProfile(process.env.TRUST_PROFILE),

      receiptVersion: process.env.RECEIPT_VERSION ?? "1",
    }),

    api: Object.freeze({
      port: Number(process.env.PORT ?? 3000),
    }),

    auth: Object.freeze({
      keys: parseApiKeys(process.env.PARMANA_API_KEYS),

      disabled: process.env.PARMANA_AUTH_DISABLED === "true",
    }),

    rateLimit: Object.freeze({
      executePerMinute: Number(process.env.RATE_LIMIT_EXECUTE_PER_MINUTE ?? 30),

      healthPerMinute: Number(process.env.RATE_LIMIT_HEALTH_PER_MINUTE ?? 300),

      publicPerMinute: Number(process.env.RATE_LIMIT_PUBLIC_PER_MINUTE ?? 60),

      authFailurePerMinute: Number(
        process.env.RATE_LIMIT_AUTH_FAILURE_PER_MINUTE ?? 30,
      ),
    }),

    logging: Object.freeze({
      level: process.env.LOG_LEVEL ?? "info",
    }),
  });
}
