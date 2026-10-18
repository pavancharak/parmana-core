import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { KeyProviders, loadConfig } from "@parmana/shared";
import {
  DEFAULT_KEY_ID,
  DEFAULT_SECONDARY_KEY_ID,
  SignerBootstrap,
  currentVerificationKeyId,
  currentVerificationSecondaryKeyId,
} from "@parmana/crypto";

/**
 * Materializes signing key material from a mounted-secret env var if the
 * configured key directory doesn't already have it, then validates the
 * minimum key pair every runtime signing operation needs is present and
 * readable — BEFORE the port is bound.
 *
 * Without this, `FileKeyProvider` only throws lazily, the first time a
 * request actually needs to sign or verify something
 * (`RuntimeAuthorizationSigner`, `ReceiptCrypto`, and `VerificationCrypto`
 * all sign/verify unconditionally with `DEFAULT_KEY_ID` — see each
 * file's own `KEY_ID`/`DEFAULT_KEY_ID` usage). A production process
 * could otherwise boot "successfully",
 * pass `/health`, and only fail on its very first real request.
 *
 * `PARMANA_KEY_MATERIAL_JSON`, if set, is a JSON object of
 * `{ "<keyId>": { "privateKeyPem": string, "publicKeyPem": string } }`
 * — written to the configured key directory only for files that don't
 * already exist there, so a pre-mounted volume or platform secret file
 * always wins and is never overwritten. This is the "load from env"
 * path for platforms with no persistent-volume or secret-file
 * primitive (see docs/site/deployment/production.mdx); a platform that does offer one should
 * mount `keys/default.{private,public}.pem` directly and leave this
 * env var unset entirely.
 */
export function assertSigningKeyMaterialConfigured(): void {
  if (process.env.NODE_ENV === "test") return;

  const config = loadConfig();

  const keyDirectory = config.keys.keyDirectory;

  // Config.ts types keyDirectory as a required string but actually
  // assigns it via `process.env.PARMANA_KEY_DIR!` with no runtime
  // check — an unset PARMANA_KEY_DIR silently becomes `undefined` at
  // runtime despite the type, the same gap requirePolicyDirectory()
  // already closed for PARMANA_POLICY_DIR. Closed here rather than in
  // Config.ts to keep this file's fail-closed checks self-contained.
  if (keyDirectory === undefined || (keyDirectory as string).trim() === "") {
    throw new Error(
      "PARMANA_KEY_DIR is not set. Refusing to start without a configured " +
        "key directory; the server cannot load or materialize signing key " +
        "material without it. Set PARMANA_KEY_DIR to the directory " +
        "containing key files (e.g. ./keys).",
    );
  }

  materializeFromEnvIfConfigured(keyDirectory);

  if (config.crypto.mode === "hybrid") {
    assertHybridKeyMaterialConfigured(config.keys.provider, keyDirectory);
  }

  // ADR-0009: KEY_PROVIDER=aws-kms moves only the "default" signing
  // key's custody to KMS -- it never touched the separate "gateway"
  // attestation key (createGatewayKeyPair.ts, DEFAULT_GATEWAY_KEY_ID
  // = "gateway"), which stays local-file-backed regardless of
  // KEY_PROVIDER (see its own doc comment: "different trust domain").
  // materializeFromEnvIfConfigured() above must still run for THAT
  // key's sake even when KEY_PROVIDER=aws-kms -- returning early
  // before it ran (this function's original ADR-0009 shape) silently
  // skipped materializing "gateway" too, which crashed every request
  // in production the moment KEY_PROVIDER=aws-kms was set, since
  // nothing else in this codebase materializes that key file. Only
  // the DEFAULT_KEY_ID-specific existence check below is skipped for
  // aws-kms -- that key genuinely has no local file under this
  // provider; assertKmsSigningKeyReachable() (async, called
  // separately) is its equivalent fail-closed check.
  if (config.keys.provider === KeyProviders.AWS_KMS) return;

  const privatePath = join(keyDirectory, `${DEFAULT_KEY_ID}.private.pem`);
  const publicPath = join(keyDirectory, `${DEFAULT_KEY_ID}.public.pem`);

  if (!existsSync(privatePath) || !existsSync(publicPath)) {
    throw new Error(
      `Signing key material for keyId "${DEFAULT_KEY_ID}" is missing from ` +
        `"${keyDirectory}" (expected ${DEFAULT_KEY_ID}.private.pem and ` +
        `${DEFAULT_KEY_ID}.public.pem). Refusing to start: every execution ` +
        "authorization, receipt, verification, and settlement confirmation " +
        "this process signs requires this key pair. Mount it as a volume " +
        "or platform secret file, or set PARMANA_KEY_MATERIAL_JSON.",
    );
  }
}

/**
 * Async counterpart to assertSigningKeyMaterialConfigured(), for
 * KEY_PROVIDER=aws-kms only (ADR-0009) -- confirms the configured KMS
 * key is reachable and has the expected key spec, before the port is
 * bound, the same "fail fast at startup, not on the first request"
 * goal as the synchronous local-file checks above. A no-op for every
 * other KEY_PROVIDER value.
 */
export async function assertKmsSigningKeyReachable(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;

  const config = loadConfig();
  if (config.keys.provider !== KeyProviders.AWS_KMS) return;

  const signer = await SignerBootstrap.create();

  if (!(await signer.hasKey(DEFAULT_KEY_ID))) {
    throw new Error(
      `KEY_PROVIDER=aws-kms is configured, but no KMS key named "${DEFAULT_KEY_ID}" ` +
        "is reachable. Refusing to start: every execution authorization, receipt, " +
        "verification, and settlement confirmation this process signs requires this " +
        "key. Verify AWS_REGION/AWS_ROLE_ARN and the key's existence/permissions.",
    );
  }

  await signer.getMetadata(DEFAULT_KEY_ID);
}

/**
 * CRYPTO_MODE=hybrid signs both entries of the hybrid `signatures`
 * array with local key files (HybridSignatureProvider over
 * FileKeyProvider, in VerificationCrypto and ReceiptCrypto), including
 * the Ed25519 entry. Under KEY_PROVIDER=aws-kms that entry's key lives
 * in KMS and has no local file, so every Trust Record would fail to
 * sign after its action had already been released; if a local file
 * did exist, the hybrid Ed25519 entry would be signed by a different
 * key than the KMS one under the same keyId. Refused at startup
 * instead. Under KEY_PROVIDER=local, every key the hybrid path reads
 * must be present now, not discovered missing on the first release.
 */
function assertHybridKeyMaterialConfigured(
  provider: string,
  keyDirectory: string,
): void {
  if (provider === KeyProviders.AWS_KMS) {
    throw new Error(
      "CRYPTO_MODE=hybrid is not supported with KEY_PROVIDER=aws-kms: the hybrid " +
        "signatures are made with local key files, and the Ed25519 key is in KMS. " +
        "Refusing to start. Use CRYPTO_MODE=single with KMS, or KEY_PROVIDER=local " +
        "for hybrid signing.",
    );
  }

  const keyIds = new Set([
    DEFAULT_KEY_ID,
    currentVerificationKeyId(),
    DEFAULT_SECONDARY_KEY_ID,
    currentVerificationSecondaryKeyId(),
  ]);

  const missing = [...keyIds].filter(
    (keyId) =>
      !existsSync(join(keyDirectory, `${keyId}.private.pem`)) ||
      !existsSync(join(keyDirectory, `${keyId}.public.pem`)),
  );

  if (missing.length > 0) {
    throw new Error(
      `CRYPTO_MODE=hybrid needs key pairs for ${missing.map((keyId) => `"${keyId}"`).join(", ")} ` +
        `in "${keyDirectory}". Refusing to start rather than fail to sign the first ` +
        "Trust Record after its action is released. Generate the secondary key with " +
        "npm run generate:hybrid-secondary-key.",
    );
  }
}

function materializeFromEnvIfConfigured(keyDirectory: string): void {
  const raw = process.env.PARMANA_KEY_MATERIAL_JSON;
  if (raw === undefined || raw.trim() === "") return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "PARMANA_KEY_MATERIAL_JSON is not valid JSON. Expected " +
        '{ "<keyId>": { "privateKeyPem": string, "publicKeyPem": string } }.',
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "PARMANA_KEY_MATERIAL_JSON must be a JSON object keyed by keyId.",
    );
  }

  mkdirSync(keyDirectory, { recursive: true });

  for (const [keyId, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    const entry = value as { privateKeyPem?: unknown; publicKeyPem?: unknown };

    if (
      typeof entry.privateKeyPem !== "string" ||
      typeof entry.publicKeyPem !== "string"
    ) {
      throw new Error(
        `PARMANA_KEY_MATERIAL_JSON["${keyId}"] must have string "privateKeyPem" ` +
          'and "publicKeyPem" fields.',
      );
    }

    const privatePath = join(keyDirectory, `${keyId}.private.pem`);
    const publicPath = join(keyDirectory, `${keyId}.public.pem`);

    if (!existsSync(privatePath)) {
      writeFileSync(privatePath, entry.privateKeyPem, { mode: 0o600 });
    }
    if (!existsSync(publicPath)) {
      writeFileSync(publicPath, entry.publicKeyPem, { mode: 0o644 });
    }
  }
}
