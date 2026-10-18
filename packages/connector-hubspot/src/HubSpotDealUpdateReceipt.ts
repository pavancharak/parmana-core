import type { CryptoProvider } from "@parmana/crypto";
import { TrustRecordHasher } from "@parmana/crypto";
import type { PolicyDecision } from "@parmana/policy";

import type { HubSpotDeal } from "./HubSpotTypes.js";

/**
 * Receipt for one HubSpot deal-update request, approved or denied. Never
 * contains privateAppToken. bearerRedacted, if present, is a one-way
 * SHA-256 fingerprint (see redactHubSpotToken), never a literal
 * substring of the token.
 */
export interface HubSpotDealUpdateReceipt {
  readonly version: 1;
  readonly businessTransactionId: string;
  readonly approved: boolean;
  readonly dealId: string;
  readonly proposedDealStage?: string;
  readonly proposedAmount?: number;
  readonly appliedDealStage?: string;
  readonly appliedAmount?: string;

  readonly policyDecision: PolicyDecision;
  readonly bearerRedacted?: string;
  readonly connectorEvidenceHash?: string;
  readonly issuedAt: string;
  readonly receiptHash: string;
}

export interface BuildHubSpotDealUpdateReceiptOptions {
  readonly businessTransactionId: string;
  readonly approved: boolean;
  readonly dealId: string;
  readonly proposedDealStage?: string;
  readonly proposedAmount?: number;
  readonly policyDecision: PolicyDecision;

  /** Already-redacted by the connector, which is the only layer that ever holds the raw token. */
  readonly bearerRedacted?: string;
  readonly deal?: HubSpotDeal;
  readonly connectorEvidenceHash?: string;
  readonly crypto: CryptoProvider;
  readonly issuedAt: Date;
}

export async function buildHubSpotDealUpdateReceipt(
  options: BuildHubSpotDealUpdateReceiptOptions,
): Promise<HubSpotDealUpdateReceipt> {
  const hasher = new TrustRecordHasher(options.crypto);

  const unhashed = {
    version: 1 as const,
    businessTransactionId: options.businessTransactionId,
    approved: options.approved,
    dealId: options.dealId,
    ...(options.proposedDealStage !== undefined
      ? { proposedDealStage: options.proposedDealStage }
      : {}),
    ...(options.proposedAmount !== undefined
      ? { proposedAmount: options.proposedAmount }
      : {}),
    ...(options.deal !== undefined
      ? {
          ...(options.deal.properties.dealstage !== undefined
            ? { appliedDealStage: options.deal.properties.dealstage }
            : {}),
          ...(options.deal.properties.amount !== undefined
            ? { appliedAmount: options.deal.properties.amount }
            : {}),
        }
      : {}),
    policyDecision: options.policyDecision,
    ...(options.bearerRedacted !== undefined
      ? { bearerRedacted: options.bearerRedacted }
      : {}),
    ...(options.connectorEvidenceHash !== undefined
      ? { connectorEvidenceHash: options.connectorEvidenceHash }
      : {}),
    issuedAt: options.issuedAt.toISOString(),
  };

  const receiptHash = await hasher.hash(unhashed);

  return Object.freeze({ ...unhashed, receiptHash });
}
