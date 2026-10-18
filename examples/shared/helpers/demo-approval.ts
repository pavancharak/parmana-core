import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

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
import type { BusinessTransaction } from "@parmana/shared";

/**
 * A demo approver for the tutorials.
 *
 * No AI agent action is authorized without a signed human approval, reads
 * included (docs/site/concepts/human-approval.mdx). So every tutorial that
 * shows an approved action first has a person sign an approval for it.
 *
 * Here the person is simulated: a key made in memory, trusted by an
 * approval verifier made in memory. In production an approver makes a key
 * on their own machine with scripts/generate-approver-key.ts, is added
 * through maker checker (docs/site/guides/manage-approvers.mdx), and signs
 * with scripts/sign-approval.ts or the SDKs' signApproval.
 */
export const DEMO_APPROVER = {
  approverId: "demo-approver",
  keyId: "demo-approver-key-1",
} as const;

const keys = generateKeyPairSync("ed25519");

const policiesDirectory = path.resolve(
  import.meta.dirname,
  "../../../policies",
);

/** Trusts DEMO_APPROVER only. Pass to createApplication(). */
export function demoApprovalVerifier(): ApprovalVerifier {
  return new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: new StaticApprovalIssuerRegistry([
      { ...DEMO_APPROVER, publicKey: keys.publicKey, revoked: false },
    ]),
    nonceStore: new MemoryNonceStore(),
  });
}

/** Trusts DEMO_APPROVER only. Pass to withSignalStateVerifier(). */
export function demoApprovalSignalVerifier(): ApprovalSignalVerifier {
  return new ApprovalSignalVerifier(demoApprovalVerifier());
}

function valueAt(transaction: BusinessTransaction, dotPath: string): unknown {
  if (dotPath === "target") {
    return transaction.intent.target;
  }

  let value: unknown = transaction.intent;

  for (const part of dotPath.split(".")) {
    value =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)[part]
        : undefined;
  }

  return value;
}

/**
 * The person signs an approval for exactly what the transaction's policy
 * asks for (its approvalSignals entry: the resource and, where named, the
 * amount), and the agent attaches it. Reads the policy file the
 * transaction names, unless a tutorial passes its own policy.
 */
export async function withDemoApproval<T extends BusinessTransaction>(
  transaction: T,
  policy: Policy = JSON.parse(
    readFileSync(
      path.join(
        policiesDirectory,
        transaction.policy.name,
        transaction.policy.version,
        "policy.json",
      ),
      "utf8",
    ),
  ) as Policy,
): Promise<T> {
  const [signalKey, declaration] =
    Object.entries(policy.approvalSignals ?? {})[0] ?? [];

  if (signalKey === undefined || declaration === undefined) {
    return transaction;
  }

  const resourceId = String(valueAt(transaction, declaration.resourceId));
  const value =
    declaration.value !== undefined
      ? valueAt(transaction, declaration.value)
      : undefined;

  const approval = await new ApprovalArtifactSigner().sign(
    {
      ...DEMO_APPROVER,
      capability: transaction.intent.action,
      resourceId,
      scope:
        typeof value === "number"
          ? { field: "value", comparator: "lte", value }
          : { field: "resourceId", comparator: "eq", value: resourceId },
      ttlSeconds: 900,
    },
    keys.privateKey,
  );

  return {
    ...transaction,
    signals: {
      ...transaction.signals,
      [signalKey]: true,
      [declaration.artifact ?? "approvalArtifact"]: JSON.parse(
        JSON.stringify(approval),
      ),
    },
  };
}
