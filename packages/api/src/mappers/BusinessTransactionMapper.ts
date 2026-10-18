import {
  Authority,
  Authorization,
  BusinessTransaction,
  BusinessTransactionStatus,
  Intent,
} from "@parmana/shared";

/**
 * Maps API requests into immutable Business Transactions.
 *
 * This mapper performs structural mapping only.
 * It does not perform validation, policy evaluation,
 * execution, persistence, or receipt generation.
 */
export class BusinessTransactionMapper {
  static fromRequest(
    request: Omit<BusinessTransaction, "status" | "createdAt">,
  ): BusinessTransaction {
    return {
      businessTransactionId: request.businessTransactionId,

      metadata: request.metadata,

      authority: request.authority as Authority,

      authorization: request.authorization as Authorization,

      intent: request.intent as Intent,

      policy: request.policy,

      signals: request.signals,

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };
  }
}
