import { createPublicKey, type KeyObject } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  StaticApprovalIssuerRegistry,
  type TrustedApprovalIssuer,
} from "@parmana/approval";
import { loadConfig } from "@parmana/shared";

/**
 * The approvers listed in code. Kept apart from
 * createApprovalIssuerRegistry.ts so code that needs only this list
 * (routes/approval-issuers.ts) does not depend on the full registry.
 */

export interface ConfiguredApprovalIssuer {
  readonly approverId: string;
  readonly keyId: string;
  readonly revoked: boolean;

  /**
   * The approver's Ed25519 public key as PEM, written here in the entry.
   * Public keys are not secret, and this list is reviewed code. This is
   * the way to provision an approver where the server cannot read
   * files you add, such as on Vercel. When absent, the key is read from
   * $PARMANA_KEY_DIR/approval-issuers/<approverId>__<keyId>.public.pem.
   */
  readonly publicKeyPem?: string;
}

/**
 * Trusted Approval Artifact issuers (TD-23 closure, Phase 3C).
 *
 * Configured here, mirroring createConnectorAuthenticator.ts's own
 * hardcoded trusted-connector-identity list exactly: provisioning a
 * new approver, or revoking/rotating an existing one's key, means
 * adding or editing an entry here and deploying -- the same
 * operational model already established for trusted connector
 * identities. A self-service onboarding flow for approvers is
 * deliberately out of scope (see
 * §17 of the Phase 3A approval artifact design (in git history),
 * Open Question #1) -- this list only verifies against whatever
 * entries it is deployed with.
 *
 * An artifact from any approver not listed here is rejected
 * (ApprovalVerifier.verify's issuerKnown check), so an empty list
 * refuses every approval: the fail-closed starting state.
 *
 * Approvers can also be added and revoked without a deploy, through
 * maker checker (routes/approval-issuers.ts): those keys live in the
 * approval_issuers table and are read by GovernedApprovalIssuerRegistry
 * below, after this list. To add one here instead: they run
 * scripts/generate-approver-key.ts on their own machine and send the
 * .public.pem file; paste its contents into publicKeyPem, open a pull
 * request, deploy. To revoke one here: revoked: true.
 *
 * Entries:
 * - manager-charak1987 key 1 (added 2026-09-28, revoked 2026-09-30):
 *   the refund manager's first key. Replaced during the 2026-09-30
 *   credential rotation by manager-charak1987-key-2, which was added
 *   through maker checker and lives in the approval_issuers table.
 *   Kept here, revoked, so approvals it signed can still be traced
 *   to a known key and the key id cannot be added again.
 */
const TRUSTED_APPROVAL_ISSUERS: readonly ConfiguredApprovalIssuer[] = [
  {
    approverId: "manager-charak1987",
    keyId: "manager-charak1987-key-1",
    revoked: true,
    publicKeyPem:
      "-----BEGIN PUBLIC KEY-----\n" +
      "MCowBQYDK2VwAyEAVMs/E6N2XEQfEEWlwMg0wRS0L4svbZ0W785aAxUP78M=\n" +
      "-----END PUBLIC KEY-----\n",
  },
];

/**
 * The approver a local test server trusts, so a quickstart can sign
 * the approval every agent action needs (docs/CLAIMS.md 2.47).
 */
export const LOCAL_TEST_APPROVER = {
  approverId: "local-test-approver",
  keyId: "local-test-approver-key-1",
} as const;

/**
 * LOCAL_TEST_APPROVER, trusted with the Ed25519 public key in the file
 * PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE names. Only when NODE_ENV is
 * test, the same gate as the test fixture connector
 * (createTestFixtureConnector.ts). Set anywhere else, the server
 * refuses to start rather than trust a key from the environment.
 */
function localTestApproverEntries(): ConfiguredApprovalIssuer[] {
  const file = process.env.PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE;

  if (file === undefined || file === "") {
    return [];
  }

  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE is set, but NODE_ENV is not test. " +
        "A test approver is trusted only on a local test server; unset it, or add " +
        "the approver through maker checker (docs/site/guides/manage-approvers.mdx).",
    );
  }

  if (!existsSync(file)) {
    throw new Error(`Test approver public key not found: ${file}.`);
  }

  return [
    {
      ...LOCAL_TEST_APPROVER,
      revoked: false,
      publicKeyPem: readFileSync(file, "utf8"),
    },
  ];
}

/**
 * The approvers listed in code above, plus the local test approver on
 * a test server.
 */
export function createCodeApprovalIssuerRegistry(): StaticApprovalIssuerRegistry {
  const entries = [...TRUSTED_APPROVAL_ISSUERS, ...localTestApproverEntries()];

  return buildApprovalIssuerRegistry(entries, () => {
    const config = loadConfig();

    if (!config.keys.keyDirectory) {
      throw new Error("PARMANA_KEY_DIR is not configured.");
    }

    return config.keys.keyDirectory;
  });
}

/**
 * Builds the registry from configured entries. A key is taken from the
 * entry's publicKeyPem when present, otherwise from its file under
 * approval-issuers/ in the key directory, which is looked up only when
 * a file is needed. Fails closed at startup: a missing file, an
 * unparseable key, a key that is not Ed25519 (approvals are verified
 * with Ed25519 only, APPROVAL_ARTIFACT_CRYPTO_PROVIDER), or the same
 * approver and key id twice stops the server.
 */
export function buildApprovalIssuerRegistry(
  entries: readonly ConfiguredApprovalIssuer[],
  keyDirectory: () => string,
): StaticApprovalIssuerRegistry {
  const seen = new Set<string>();

  const issuers: TrustedApprovalIssuer[] = entries.map(
    ({ approverId, keyId, revoked, publicKeyPem }) => {
      const label = `${approverId}__${keyId}`;

      if (seen.has(label)) {
        throw new Error(
          `Approval issuer ${approverId} with key ${keyId} is listed twice.`,
        );
      }

      seen.add(label);

      let pem = publicKeyPem;

      if (pem === undefined) {
        const publicKeyPath = join(
          keyDirectory(),
          "approval-issuers",
          `${label}.public.pem`,
        );

        if (!existsSync(publicKeyPath)) {
          throw new Error(
            `Approval issuer public key not found: ${publicKeyPath}. Provision it, or put it in the entry as publicKeyPem, before starting -- ` +
              "no key is generated automatically.",
          );
        }

        pem = readFileSync(publicKeyPath, "utf8");
      }

      let publicKey: KeyObject;

      try {
        publicKey = createPublicKey(pem);
      } catch (error) {
        throw new Error(
          `Approval issuer ${approverId} key ${keyId}: the public key is not a valid PEM public key (${error instanceof Error ? error.message : String(error)}).`,
          { cause: error },
        );
      }

      if (publicKey.asymmetricKeyType !== "ed25519") {
        throw new Error(
          `Approval issuer ${approverId} key ${keyId}: the public key is ${publicKey.asymmetricKeyType}, but approval keys must be Ed25519.`,
        );
      }

      return { approverId, keyId, publicKey, revoked };
    },
  );

  return new StaticApprovalIssuerRegistry(issuers);
}
