import type { BusinessTransaction } from "./business-transaction.js";
import type { Execution } from "./execution.js";
import type { Override } from "./override.js";
import type { Receipt } from "./receipt.js";
import type { Signature } from "./signature.js";
import type { Verification } from "./verification.js";
import type { PolicyGovernanceAnchorStatus } from "./policy.js";

/**
 * Explicit binding linking policy-governance provenance to what a
 * connector actually did -- see the server's EvidenceAnchor domain
 * type for the full rationale. Absent on a Trust Record built before
 * this field existed.
 */
export interface EvidenceAnchor {
  readonly policyContentHash?: string;
  readonly governanceAnchorStatus?: PolicyGovernanceAnchorStatus;
  readonly connectorEvidenceHash?: string;
  readonly anchorHash: string;
}

export interface ExecutionTrustRecord {
  readonly trustRecordId: string;
  readonly businessTransactionId: string;
  readonly transaction: BusinessTransaction;
  readonly overrides: Override[];
  readonly executions: Execution[];
  readonly verifications: Verification[];
  readonly receipts: Receipt[];
  readonly trustRecordHash: string;
  readonly signature: Signature;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly evidenceAnchor?: EvidenceAnchor;
}
