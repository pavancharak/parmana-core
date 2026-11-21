import type { Config } from "./Config.js";

/**
 * The settings that decide how this process signs, in a form safe to log.
 *
 * Logged once at startup, so an operator can see what a deployment is really
 * running without reading the host's environment variables. It contains no
 * secret values and no secret names or ARNs: where a key comes from is reported
 * as a category ("file", "aws-kms", "secret"), and whether a secret is
 * configured is reported as a boolean.
 */
export interface EffectiveCryptoConfig {
  readonly cryptoMode: string;
  readonly primarySignatureProvider: string;
  readonly secondarySignatureProvider: string | null;
  readonly hybridSchemaVersion: number;
  readonly hybridSignatureRequired: boolean;
  readonly keyProvider: string;
  readonly hybridKmsPrimary: boolean;
  readonly secondaryKeySource: "none" | "secret" | "file";
}

export function describeEffectiveCrypto(
  config: Readonly<Config>,
): EffectiveCryptoConfig {
  const secondary = config.crypto.secondarySignatureProvider ?? null;
  const hybrid = config.crypto.mode === "hybrid";
  let secondaryKeySource: EffectiveCryptoConfig["secondaryKeySource"] = "none";
  if (hybrid) {
    secondaryKeySource =
      config.keys.secondaryKeySecretId !== undefined ? "secret" : "file";
  }
  return Object.freeze({
    cryptoMode: config.crypto.mode,
    primarySignatureProvider: config.crypto.primarySignatureProvider,
    secondarySignatureProvider: secondary,
    hybridSchemaVersion: config.crypto.hybridSchemaVersion,
    hybridSignatureRequired: config.crypto.requireHybridSignature,
    keyProvider: config.keys.provider,
    hybridKmsPrimary: config.keys.hybridKmsPrimary,
    secondaryKeySource,
  });
}
