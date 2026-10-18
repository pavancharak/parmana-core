import type { Authority } from "./authority.js";
import type { Authorization } from "./authorization.js";
import type { Intent } from "./intent.js";
import type { PolicyReference } from "./policy.js";

export interface BusinessTransactionMetadata {
  readonly businessTransactionId: string;
  readonly correlationId?: string;
  readonly tenantId?: string | null;
  readonly sourceSystem?: string;
  readonly submittedBy?: string;
  readonly submittedAt?: Date;
}

export type BusinessTransactionStatus =
  | "RECEIVED"
  | "POLICY_EVALUATED"
  | "APPROVED"
  | "REJECTED"
  | "OVERRIDDEN"
  | "EXECUTING"
  | "EXECUTED"
  | "FAILED"
  | "VERIFIED";

export interface BusinessTransaction {
  readonly businessTransactionId: string;
  readonly metadata: BusinessTransactionMetadata;
  readonly authority: Authority;
  readonly authorization: Authorization;
  readonly intent: Intent;
  readonly policy: PolicyReference;
  readonly signals: Record<string, unknown>;
  readonly status: BusinessTransactionStatus;
  readonly createdAt: Date;
}
