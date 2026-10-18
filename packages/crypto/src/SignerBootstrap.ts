import { KeyProviders, loadConfig } from "@parmana/shared";

import { CryptoBootstrap } from "./CryptoBootstrap.js";
import type { Signer } from "./Signer.js";

import { KmsSigner } from "./providers/signer/KmsSigner.js";
import { LocalFileSigner } from "./providers/signer/LocalFileSigner.js";

/**
 * Signer Bootstrap.
 *
 * Composition root for the Signer abstraction (ADR-0009) -- the
 * signing-capable sibling of KeyBootstrap/KeyProvider. Reuses the
 * already-reserved KEY_PROVIDER=aws-kms value from
 * packages/shared/src/config/KeyProviders.ts; KeyBootstrap.ts itself
 * is unchanged (nothing in this codebase's production paths actually
 * calls it today -- every existing signing call site constructed its
 * own FileKeyProvider directly, which is exactly what this bootstrap
 * replaces).
 *
 * async, unlike KeyBootstrap.create(): resolving KmsSigner's
 * credentials may require a dynamic import of an optional peer
 * dependency (see KmsSigner.create()'s own doc comment).
 *
 * Deliberately NOT memoized (unlike KeyBootstrap.create()'s static
 * caching): every existing signing call site previously constructed
 * its own fresh `new FileKeyProvider()` per instance, which re-reads
 * `loadConfig().keys.keyDirectory` (and so the current
 * PARMANA_KEY_DIR) fresh every time. A static singleton here broke
 * that -- caught by a real CI failure
 * (packages/api/tests/unit/supabase-caller-audit-sink.test.ts), where
 * each test sets PARMANA_KEY_DIR to its own temp directory and tears
 * it down in afterEach: the first test to run would permanently poison
 * a process-wide cached signer pointing at a directory every
 * subsequent test had already deleted. Reconstructing a
 * KMSClient/FileKeyProvider per call is cheap (no network call happens
 * until an actual sign/getPublicKey/etc. request), so there is no
 * meaningful cost to matching the old per-instance-fresh-read
 * semantics exactly.
 */
export class SignerBootstrap {
  static async create(): Promise<Signer> {
    const configuredProvider = loadConfig().keys.provider;

    if (configuredProvider === KeyProviders.LOCAL) {
      return new LocalFileSigner(CryptoBootstrap.create());
    }

    if (configuredProvider === KeyProviders.AWS_KMS) {
      return KmsSigner.create();
    }

    throw new Error(
      `KEY_PROVIDER=${configuredProvider} is not implemented. Only "${KeyProviders.LOCAL}" ` +
        `and "${KeyProviders.AWS_KMS}" have a real Signer implementation today. Refusing to ` +
        "start with a configured key custody model (azure-key-vault, gcp-kms, hsm) that would " +
        "silently fall back to file-based keys instead of the custody the configuration requested.",
    );
  }
}
