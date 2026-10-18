import crypto from "node:crypto";

import {
  CryptoBootstrap,
  DEFAULT_KEY_ID,
  ExecutionIntentCrypto,
} from "@parmana/crypto";

import type { ExecutionIntent } from "@parmana/shared";

import type { RuntimeContext } from "./context/RuntimeContext.js";

type ExecutionIntentDraft = Omit<ExecutionIntent, "intentHash" | "signature">;

/**
 * Builds the signed Execution Intent (ADR-0012) from the runtime context as it
 * stands immediately before release: after the decision and the signed
 * authorization exist, and before the connector is called.
 *
 * Everything in the intent already exists at that point. The hashes are copied
 * from the signed authorization payload rather than recomputed, so the intent
 * cannot disagree with the authorization it refers to. The execution result
 * and the raw intent parameters are deliberately not included.
 */
export class ExecutionIntentBuilder {
  private readonly crypto = new ExecutionIntentCrypto();

  async build(context: RuntimeContext): Promise<ExecutionIntent> {
    const authorization = context.authorization;

    if (!authorization) {
      throw new Error(
        "A signed execution authorization is required to build an Execution Intent.",
      );
    }

    const payload = authorization.payload;

    const now = new Date();

    const draft: ExecutionIntentDraft = {
      intentId: crypto.randomUUID(),

      businessTransactionId: context.transaction.businessTransactionId,

      decisionId: context.decision.decisionId,

      authorizationId: payload.authorizationId,

      policyName: payload.policyName,

      policyVersion: payload.policyVersion,

      ...(payload.policyContentHash !== undefined && {
        policyContentHash: payload.policyContentHash,
      }),

      ...(payload.signalsHash !== undefined && {
        signalsHash: payload.signalsHash,
      }),

      businessTransactionHash: payload.businessTransactionHash,

      action: context.transaction.intent.action,

      target: context.transaction.intent.target,

      ...(payload.submittedBy !== undefined && {
        submittedBy: payload.submittedBy,
      }),

      ...(payload.grantedCapability !== undefined && {
        grantedCapability: payload.grantedCapability,
      }),

      createdAt: now,
    };

    const unsigned = {
      ...draft,

      intentHash: "",

      signature: {
        algorithm: CryptoBootstrap.create().signature.algorithm,

        keyId: DEFAULT_KEY_ID,

        value: "",

        signedAt: now,
      },
    };

    const intentHash = await this.crypto.hash(unsigned);

    const withHash = {
      ...unsigned,

      intentHash,
    };

    const signature = await this.crypto.sign(withHash);

    return {
      ...withHash,

      signature,
    };
  }
}
