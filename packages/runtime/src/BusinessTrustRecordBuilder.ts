import crypto from "node:crypto";

import {
  CryptoBootstrap,
  DEFAULT_KEY_ID,
  TrustRecordHasher,
  VerificationCrypto,
} from "@parmana/crypto";

import {
  EvidenceAnchor,
  ExecutionTrustRecord,
  loadConfig,
} from "@parmana/shared";

import { RuntimeContext } from "./context/RuntimeContext.js";

/**
 * Internal draft used during construction.
 */
type TrustRecordDraft = Omit<
  ExecutionTrustRecord,
  "trustRecordHash" | "signature"
>;

/**
 * Safely reads executions[0].evidence.attributes.connector.connectorEvidenceHash
 * without assuming its shape -- `attributes` is a generic, execution-
 * system-specific bag (ExecutionEvidence.attributes' own doc comment),
 * so this only trusts what it can directly confirm is a string.
 */
function readConnectorEvidenceHash(
  context: RuntimeContext,
): string | undefined {
  const connector = context.execution?.evidence?.attributes?.connector;

  if (
    connector !== null &&
    typeof connector === "object" &&
    "connectorEvidenceHash" in connector &&
    typeof (connector as { connectorEvidenceHash: unknown })
      .connectorEvidenceHash === "string"
  ) {
    return (connector as { connectorEvidenceHash: string })
      .connectorEvidenceHash;
  }

  return undefined;
}

/**
 * Builds the canonical Execution Trust Record.
 */
export class BusinessTrustRecordBuilder {
  private readonly crypto = new VerificationCrypto();

  private readonly evidenceAnchorHasher = new TrustRecordHasher(
    CryptoBootstrap.create(),
  );

  private readonly config = loadConfig();

  /**
   * Builds the explicit evidence-anchor binding (G-45's residual
   * "Record 3 is outside all three [policy-governance] mechanisms"
   * gap) -- see EvidenceAnchor's own doc comment for exactly what this
   * does and does not add over the implicit binding trustRecordHash
   * already provides. Undefined when there is nothing to anchor at
   * all (should not occur for any real Trust Record, since G-24
   * always stamps policyContentHash, but stays honest rather than
   * assuming).
   */
  private async buildEvidenceAnchor(
    context: RuntimeContext,
  ): Promise<EvidenceAnchor | undefined> {
    const policyContentHash = context.transaction.policy.contentHash;
    const governanceAnchorStatus =
      context.transaction.policy.governanceAnchor?.status;
    const connectorEvidenceHash = readConnectorEvidenceHash(context);

    if (
      policyContentHash === undefined &&
      governanceAnchorStatus === undefined &&
      connectorEvidenceHash === undefined
    ) {
      return undefined;
    }

    const anchorHash = await this.evidenceAnchorHasher.hash({
      policyContentHash,
      governanceAnchorStatus,
      connectorEvidenceHash,
    });

    return {
      ...(policyContentHash !== undefined && { policyContentHash }),
      ...(governanceAnchorStatus !== undefined && { governanceAnchorStatus }),
      ...(connectorEvidenceHash !== undefined && { connectorEvidenceHash }),
      anchorHash,
    };
  }

  /**
   * Builds an immutable Execution Trust Record
   * from the current RuntimeContext.
   */
  async build(context: RuntimeContext): Promise<ExecutionTrustRecord> {
    if (!context.execution) {
      throw new Error("Execution artifact is required.");
    }

    const now = new Date();

    const evidenceAnchor = await this.buildEvidenceAnchor(context);

    const draft: TrustRecordDraft = {
      trustRecordId: crypto.randomUUID(),

      businessTransactionId: context.transaction.businessTransactionId,

      transaction: context.transaction,

      ...(context.authorization !== undefined
        ? { authorization: context.authorization }
        : {}),

      overrides: context.override ? [context.override] : [],

      executions: [context.execution],

      verifications: context.verification ? [context.verification] : [],

      receipts: context.receipt ? [context.receipt] : [],

      ...(evidenceAnchor !== undefined && { evidenceAnchor }),

      createdAt: now,

      updatedAt: now,
    };

    //
    // Temporary Trust Record for hashing.
    //
    const trustRecord = {
      ...draft,

      trustRecordHash: "",

      signature: {
        algorithm: CryptoBootstrap.create().signature.algorithm,

        keyId: DEFAULT_KEY_ID,

        value: "",

        signedAt: now,
      },
    };

    const trustRecordHash = await this.crypto.hash(trustRecord);

    const recordWithHash = {
      ...trustRecord,

      trustRecordHash,
    };

    const signature = await this.crypto.sign(recordWithHash);

    //
    // Hybrid Signature Support milestone, Phase A: additive second
    // signature pass, only when CRYPTO_MODE=hybrid. The legacy
    // `signature` above is unaffected either way.
    //
    if (this.config.crypto.mode !== "hybrid") {
      return {
        ...recordWithHash,

        signature,
      };
    }

    const signatures = await this.crypto.signHybrid(recordWithHash);

    return {
      ...recordWithHash,

      signature,

      schemaVersion: 2,

      signatures,
    };
  }
}
