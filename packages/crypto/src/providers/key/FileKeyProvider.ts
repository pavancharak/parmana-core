import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

import { existsSync, readFileSync } from "node:fs";

import { readdir } from "node:fs/promises";

import { resolve, sep } from "node:path";

import {
  loadConfig,
  SignatureAlgorithms,
  type SignatureAlgorithm,
} from "@parmana/shared";

import type { KeyMetadata, KeyProvider } from "../../KeyProvider.js";

import { CryptoError } from "../../errors/CryptoError.js";

/**
 * Maps a node:crypto KeyObject's own `asymmetricKeyType` back to this
 * codebase's SignatureAlgorithm identifiers -- the same "ml-dsa-65"
 * internal-name alias Dilithium3SignatureProvider.ts and
 * scripts/generate-keypair.ts already use. Unrecognized key types
 * (a key file this codebase has no SignatureProvider for) throw
 * rather than silently mislabeling the key's algorithm.
 */
function algorithmFromKeyType(keyType: string | undefined): SignatureAlgorithm {
  if (keyType === "ed25519") {
    return SignatureAlgorithms.ED25519;
  }

  if (keyType === "ml-dsa-65") {
    return SignatureAlgorithms.DILITHIUM3;
  }

  throw new CryptoError(
    `Key material has unrecognized asymmetricKeyType: ${JSON.stringify(keyType)}.`,
  );
}

/**
 * keyId becomes a path segment (`<keyId>.private.pem`); anything outside
 * this set (path separators, `..`, null bytes, etc.) could otherwise walk
 * out of the configured key directory.
 */
const VALID_KEY_ID = /^[A-Za-z0-9._-]+$/;

function assertValidKeyId(keyId: string): void {
  if (!VALID_KEY_ID.test(keyId)) {
    throw new CryptoError(
      `Invalid keyId: ${JSON.stringify(keyId)}. Must match ${VALID_KEY_ID}.`,
    );
  }
}

/**
 * File Key Provider.
 *
 * Loads signing keys from the local filesystem.
 *
 * Layout:
 *
 * keys/
 *   <keyId>.private.pem
 *   <keyId>.public.pem
 *
 * This implementation is intended for development
 * and self-hosted deployments. Production
 * environments can replace it with KMS, HSM, or
 * cloud key vault implementations without changing
 * the crypto layer.
 */
export class FileKeyProvider implements KeyProvider {
  private readonly config = loadConfig();

  private readonly keyDirectory = this.config.keys.keyDirectory ?? "./keys";

  /**
   * Root directory containing Parmana keys.
   */
  private getKeyDirectory(): string {
    if (!existsSync(this.keyDirectory)) {
      throw new Error(`Key directory does not exist: ${this.keyDirectory}`);
    }

    return this.keyDirectory;
  }

  /**
   * Returns true if the key exists.
   */
  async hasKey(keyId: string): Promise<boolean> {
    return existsSync(this.privateKeyPath(keyId));
  }

  /**
   * Returns key metadata.
   *
   * PQC audit RED-2 (docs/VERIFICATION-GAPS.md) fix: algorithm is
   * derived from the actual public key material's own
   * `asymmetricKeyType`, not from `config.crypto.primarySignatureProvider`
   * as this method previously did. That global config value describes
   * only the *current* primary signing algorithm -- it is wrong for
   * every other keyId this provider can load (the `gateway` key, any
   * rotated `verification-*` keyId from
   * scripts/rotate-verification-key.ts, or a `default` key kept
   * verifiable after a rotation moved new signing elsewhere). This
   * previously went unnoticed because getMetadata() was never
   * consulted on the hot sign/verify path (assertKeyType.ts's own doc
   * comment already covers that path's real defense); it is
   * consulted now, by the /keys and /.well-known/jwks.json routes
   * (packages/api/src/routes/keys.ts), which need the truth for every
   * keyId, not only whichever one happens to match today's config.
   *
   * Future implementations may load this from a
   * manifest or key registry.
   */
  async getMetadata(keyId: string): Promise<KeyMetadata> {
    if (!(await this.hasKey(keyId))) {
      throw new Error(`Key not found: ${keyId}`);
    }

    const publicKey = await this.getPublicKey(keyId);

    return {
      keyId,
      algorithm: algorithmFromKeyType(publicKey.asymmetricKeyType),
    };
  }

  /**
   * Loads the private key.
   */
  async getPrivateKey(keyId: string): Promise<KeyObject> {
    const path = this.privateKeyPath(keyId);

    if (!existsSync(path)) {
      throw new Error(`Private key not found: ${keyId}`);
    }

    return createPrivateKey(readFileSync(path));
  }

  /**
   * Loads the public key.
   */
  async getPublicKey(keyId: string): Promise<KeyObject> {
    const path = this.publicKeyPath(keyId);

    if (!existsSync(path)) {
      throw new Error(`Public key not found: ${keyId}`);
    }

    return createPublicKey(readFileSync(path));
  }

  /**
   * Lists every keyId with a readable `<keyId>.public.pem` in this
   * provider's key directory (PQC audit RED-2). A keyId with only a
   * private key file (should not occur in practice, since every key
   * this codebase generates writes both halves together) is not
   * listed -- discovery is about what a third party can verify
   * against, which needs the public half specifically.
   */
  async listKeys(): Promise<string[]> {
    const directory = this.getKeyDirectory();

    const entries = await readdir(directory);

    return entries
      .filter((entry) => entry.endsWith(".public.pem"))
      .map((entry) => entry.slice(0, -".public.pem".length));
  }

  /**
   * Resolves the private key path.
   */
  private privateKeyPath(keyId: string): string {
    return this.keyFilePath(keyId, "private");
  }

  /**
   * Resolves the public key path.
   */
  private publicKeyPath(keyId: string): string {
    return this.keyFilePath(keyId, "public");
  }

  /**
   * `<keyDirectory>/<keyId>.<kind>.pem`, after assertValidKeyId() and a
   * second check that the resolved path stays inside the key directory.
   */
  private keyFilePath(keyId: string, kind: "private" | "public"): string {
    assertValidKeyId(keyId);

    const directory = resolve(this.getKeyDirectory());
    const file = resolve(directory, `${keyId}.${kind}.pem`);

    if (!file.startsWith(directory + sep)) {
      throw new CryptoError(
        `Invalid keyId: ${JSON.stringify(keyId)}. Must name a file in the key directory.`,
      );
    }

    return file;
  }
}
