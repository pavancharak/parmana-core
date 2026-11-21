import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

import type { KeyMetadata, KeyProvider } from "../../KeyProvider.js";

/**
 * Returns the PEM text of one secret. The default reads AWS Secrets Manager; tests inject their own.
 */
export type SecretReader = (secretId: string) => Promise<string>;

/**
 * How long a fetched secret is reused before it is read again. Bounds how long a rotated secret
 * can keep serving its previous key.
 */
export const SECRET_KEY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Serves the secondary (post-quantum) signing key from a secret, so it never has to sit on disk.
 *
 * Only keyId `secondaryKeyId` is read from the secret. Every other keyId, including the primary
 * key, is passed to the fallback KeyProvider unchanged. The secret is read on first use and
 * cached for SECRET_KEY_CACHE_TTL_MS; a failed read is never cached, so a fix takes effect on the
 * next request.
 *
 * The secret holds the private key as PEM (PKCS#8). The public key is derived from it, so the
 * secret is the only copy of the key material this provider needs.
 */
export class SecretSecondaryKeyProvider implements KeyProvider {
  private cached?: { key: KeyObject; readAt: number };

  constructor(
    private readonly secondaryKeyId: string,
    private readonly secretId: string,
    private readonly readSecret: SecretReader,
    private readonly fallback: KeyProvider,
    private readonly now: () => number = Date.now,
  ) {}

  private async secondaryPrivateKey(): Promise<KeyObject> {
    if (
      this.cached !== undefined &&
      this.now() - this.cached.readAt < SECRET_KEY_CACHE_TTL_MS
    ) {
      return this.cached.key;
    }

    const pem = await this.readSecret(this.secretId);
    const key = createPrivateKey(pem);

    this.cached = { key, readAt: this.now() };
    return key;
  }

  async getPrivateKey(keyId: string): Promise<KeyObject> {
    if (keyId === this.secondaryKeyId) {
      return this.secondaryPrivateKey();
    }
    return this.fallback.getPrivateKey(keyId);
  }

  async getPublicKey(keyId: string): Promise<KeyObject> {
    if (keyId === this.secondaryKeyId) {
      return createPublicKey(await this.secondaryPrivateKey());
    }
    return this.fallback.getPublicKey(keyId);
  }

  async hasKey(keyId: string): Promise<boolean> {
    if (keyId === this.secondaryKeyId) {
      return true;
    }
    return this.fallback.hasKey(keyId);
  }

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    return this.fallback.getMetadata(keyId);
  }

  async listKeys(): Promise<string[]> {
    const keys = this.fallback.listKeys ? await this.fallback.listKeys() : [];
    return keys.includes(this.secondaryKeyId)
      ? keys
      : [...keys, this.secondaryKeyId];
  }
}

/**
 * The default reader: AWS Secrets Manager, in AWS_REGION. Loaded on first use, so the SDK is not
 * needed when no secret is configured.
 */
export async function readSecretFromAws(secretId: string): Promise<string> {
  const { GetSecretValueCommand, SecretsManagerClient } =
    await import("@aws-sdk/client-secrets-manager");
  const region = process.env.AWS_REGION;
  if (region === undefined || region.trim() === "") {
    throw new Error(
      "AWS_REGION is not set, and reading the secondary key secret needs it.",
    );
  }
  const client = new SecretsManagerClient({ region });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  if (typeof response.SecretString !== "string") {
    throw new Error(
      "The secondary key secret has no string value (binary secrets are not supported).",
    );
  }
  return response.SecretString;
}
