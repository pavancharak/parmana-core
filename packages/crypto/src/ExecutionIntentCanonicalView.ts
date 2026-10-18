import type { ExecutionIntent } from "@parmana/shared";

/**
 * The exact projection of an Execution Intent that is hashed and signed
 * (ADR-0012). It excludes `intentHash` and `signature`, which are computed
 * from it.
 *
 * ExecutionIntentCrypto (signing and online verification) and
 * verifyExecutionIntentOffline both use this one function, so the signer and
 * every verifier can never disagree about what was signed. Changing what is
 * included here changes what is signed, and invalidates every existing intent.
 */
export function canonicalExecutionIntent(intent: ExecutionIntent) {
  return {
    intentId: intent.intentId,

    businessTransactionId: intent.businessTransactionId,

    decisionId: intent.decisionId,

    authorizationId: intent.authorizationId,

    policyName: intent.policyName,

    policyVersion: intent.policyVersion,

    policyContentHash: intent.policyContentHash,

    signalsHash: intent.signalsHash,

    businessTransactionHash: intent.businessTransactionHash,

    action: intent.action,

    target: intent.target,

    submittedBy: intent.submittedBy,

    grantedCapability: intent.grantedCapability,

    createdAt: intent.createdAt,
  };
}
