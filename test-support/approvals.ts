import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ApprovalSignalVerifier,
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { Policy } from "@parmana/policy";
import type { BusinessTransaction, SignedApproval } from "@parmana/shared";

/**
 * Test only. No agent action is ever authorized without a signed human
 * approval (PolicyValidator.validateEveryApprovalNeedsSignedApproval),
 * so every test that expects an approved action signs one here.
 *
 * One hermetic approver per test file, the same way vitest.setup.ts
 * makes one signing keypair per test file. Nothing here is trusted
 * outside tests: production trusts only the approvers listed in
 * packages/api/src/bootstrap/codeApprovalIssuers.ts or approved
 * through approval issuer governance.
 */
export const TEST_APPROVER = {
  approverId: "test-approver",
  keyId: "test-approver-key-1",
} as const;

const keys = generateKeyPairSync("ed25519");

const policiesDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "policies",
);

export function testApprovalIssuerRegistry(): StaticApprovalIssuerRegistry {
  return new StaticApprovalIssuerRegistry([
    { ...TEST_APPROVER, publicKey: keys.publicKey, revoked: false },
  ]);
}

export function testApprovalVerifier(): ApprovalVerifier {
  return new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: testApprovalIssuerRegistry(),
    nonceStore: new MemoryNonceStore(),
  });
}

export function testApprovalSignalVerifier(
  approvalVerifier: ApprovalVerifier = testApprovalVerifier(),
): ApprovalSignalVerifier {
  return new ApprovalSignalVerifier(approvalVerifier);
}

/**
 * Who signs. Defaults to the hermetic TEST_APPROVER; a test file that
 * trusts its own approver (by mocking createApprovalIssuerRegistry)
 * passes that approver instead.
 */
export interface TestApprovalSigner {
  readonly approverId: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
}

export function signTestApproval(options: {
  readonly capability: string;
  readonly resourceId: string;
  readonly value?: number;
  readonly ttlSeconds?: number;
  readonly signer?: TestApprovalSigner;
}): Promise<SignedApproval> {
  return new ApprovalArtifactSigner().sign(
    {
      approverId: options.signer?.approverId ?? TEST_APPROVER.approverId,
      keyId: options.signer?.keyId ?? TEST_APPROVER.keyId,
      capability: options.capability,
      resourceId: options.resourceId,
      scope:
        options.value !== undefined
          ? { field: "value", comparator: "lte", value: options.value }
          : {
              field: "resourceId",
              comparator: "eq",
              value: options.resourceId,
            },
      ttlSeconds: options.ttlSeconds ?? 900,
    },
    options.signer?.privateKey ?? keys.privateKey,
  );
}

function loadPolicyFile(transaction: BusinessTransaction): Policy {
  return JSON.parse(
    readFileSync(
      join(
        policiesDirectory,
        transaction.policy.name,
        transaction.policy.version,
        "policy.json",
      ),
      "utf8",
    ),
  ) as Policy;
}

function resolvePath(transaction: BusinessTransaction, path: string): unknown {
  if (path === "target") {
    return transaction.intent.target;
  }

  let value: unknown = transaction.intent;

  for (const part of path.split(".")) {
    value =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)[part]
        : undefined;
  }

  return value;
}

/**
 * Returns the transaction with a signed approval for exactly what its
 * policy's approvalSignals entry needs: the approval signal set true
 * and the artifact attached. Reads the policy file the transaction
 * declares, unless a test passes its own in memory policy, so a test
 * never restates the policy's resource or amount paths.
 */
export async function withTestApproval<T extends BusinessTransaction>(
  transaction: T,
  policy: Policy = loadPolicyFile(transaction),
  signer?: TestApprovalSigner,
): Promise<T> {
  const [signalKey, declaration] =
    Object.entries(policy.approvalSignals ?? {})[0] ?? [];

  if (signalKey === undefined || declaration === undefined) {
    throw new Error(
      `${policy.policyId}@${policy.policyVersion} declares no approvalSignals.`,
    );
  }

  const resourceId = resolvePath(transaction, declaration.resourceId);
  const value =
    declaration.value !== undefined
      ? resolvePath(transaction, declaration.value)
      : undefined;

  const artifact = await signTestApproval({
    capability: transaction.intent.action,
    resourceId: String(resourceId),
    ...(typeof value === "number" ? { value } : {}),
    ...(signer !== undefined ? { signer } : {}),
  });

  return {
    ...transaction,
    signals: {
      ...transaction.signals,
      [signalKey]: true,
      [declaration.artifact ?? "approvalArtifact"]: JSON.parse(
        JSON.stringify(artifact),
      ),
    },
  };
}
