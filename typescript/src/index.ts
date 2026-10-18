/**
 * Parmana TypeScript SDK
 *
 * Canonical public API.
 *
 * This module defines the complete public surface
 * of the Parmana TypeScript SDK.
 */

// -----------------------------------------------------------------------------
// SDK Version
// -----------------------------------------------------------------------------

export { VERSION } from "./version.js";

// -----------------------------------------------------------------------------
// SDK Client
// -----------------------------------------------------------------------------

export { ParmanaClient } from "./client/ParmanaClient.js";

// -----------------------------------------------------------------------------
// SDK APIs
// -----------------------------------------------------------------------------

export { HealthApi } from "./client/HealthApi.js";
export { ExecutionApi } from "./client/ExecutionApi.js";
export { VerificationApi } from "./client/VerificationApi.js";
export { ReplayApi } from "./client/ReplayApi.js";
export { PolicyApi, type PolicyValidationResult } from "./client/PolicyApi.js";

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export type { Configuration } from "./config/Configuration.js";

export type { RetryPolicy } from "./config/RetryPolicy.js";

export { RetryStrategy } from "./config/RetryPolicy.js";

export type {
  Transport,
  TransportRequest,
  TransportResponse,
} from "./config/Transport.js";

// -----------------------------------------------------------------------------
// Transport
// -----------------------------------------------------------------------------

export { HttpTransport } from "./transport/HttpTransport.js";

// -----------------------------------------------------------------------------
// Canonical Parmana Domain Model
// -----------------------------------------------------------------------------

export * from "./models/index.js";

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

export {
  createBusinessTransaction,
  type CreateBusinessTransactionOptions,
} from "./builders/createBusinessTransaction.js";

// -----------------------------------------------------------------------------
// SDK Errors
// -----------------------------------------------------------------------------

export * from "./errors/ParmanaError.js";
export * from "./errors/ConfigurationError.js";
export * from "./errors/ValidationError.js";
export * from "./errors/AuthenticationError.js";
export * from "./errors/AuthorizationError.js";
export * from "./errors/NotFoundError.js";
export * from "./errors/ConflictError.js";
export * from "./errors/ExecutionRejectedError.js";
export * from "./errors/InternalServerError.js";
export * from "./errors/NetworkError.js";
export * from "./errors/RateLimitError.js";
export * from "./errors/ReplayError.js";
export * from "./errors/TimeoutError.js";
export * from "./errors/VerificationError.js";
export { ReceiptApi } from "./client/ReceiptApi.js";
export { TransactionApi } from "./client/TransactionApi.js";
export { TrustRecordApi } from "./client/TrustRecordApi.js";
export { RefusalApi } from "./client/RefusalApi.js";
export { ExecutionIntentApi } from "./client/ExecutionIntentApi.js";
export { AuditApi } from "./client/AuditApi.js";
export { CallerApi } from "./client/CallerApi.js";
export { ApproverApi } from "./client/ApproverApi.js";
export { ExternalConnectorApi } from "./client/ExternalConnectorApi.js";
export { BusinessSignalSourceApi } from "./client/BusinessSignalSourceApi.js";
export { AuthorityGrantApi } from "./client/AuthorityGrantApi.js";

// -----------------------------------------------------------------------------
// Offline verification, step up signing and approval signing
// -----------------------------------------------------------------------------

export {
  verifyExecutionTrustRecordOffline,
  verifyExecutionIntentOffline,
  type OfflineVerificationResult,
  type PublicKeys,
} from "./crypto/offline-verifier.js";

export {
  signPolicyChangeStepUp,
  type SignPolicyChangeStepUpInput,
} from "./crypto/step-up.js";

export {
  signApproval,
  DEFAULT_APPROVAL_TTL_SECONDS,
  MAX_APPROVAL_TTL_SECONDS,
  type SignApprovalInput,
  type SignedApproval,
  type ApprovalPayload,
  type ApprovalScope,
  type ApprovalScopeComparator,
} from "./crypto/approval.js";

export { canonicalSerialize } from "./crypto/canonical.js";

export {
  verifyParmanaRelease,
  DEFAULT_RELEASE_CLOCK_SKEW_SECONDS,
  type ParmanaRelease,
  type ParmanaReleaseCondition,
  type ParmanaReleaseVerification,
  type VerifyParmanaReleaseOptions,
} from "./crypto/release.js";
