/**
 * @parmana/storage
 *
 * Canonical public API.
 */

// -----------------------------------------------------------------------------
// Storage Abstraction
// -----------------------------------------------------------------------------

export * from "./StorageProvider.js";
export * from "./StorageFactory.js";
export * from "./StorageConfiguration.js";

// -----------------------------------------------------------------------------
// Built-in Providers
// -----------------------------------------------------------------------------

export * from "./memory/MemoryStorageProvider.js";
export * from "./memory/MemoryExecutionAuditSink.js";

export * from "./memory/MemoryBusinessTransactionRepository.js";
export * from "./memory/MemoryExecutionTrustRecordRepository.js";
export * from "./memory/MemoryExecutionIntentRepository.js";
export * from "./memory/MemoryRefusalRecordRepository.js";
export * from "./memory/MemoryInboundDecisionRepository.js";
export * from "./memory/MemoryInboundCheckRepository.js";
export * from "./memory/MemoryInboundOutcomeRepository.js";
export * from "./memory/MemoryChallengeRecordRepository.js";
export * from "./memory/MemoryPolicyRepository.js";
export * from "./memory/MemoryPendingPolicyChangeRepository.js";
export * from "./memory/MemoryPolicyChangeApprovalRecordRepository.js";
export * from "./memory/MemoryHandbookDownloadLeadRepository.js";
export * from "./memory/MemoryApprovalIssuerRepository.js";
export * from "./memory/MemoryCallerKeyRevocationRepository.js";
export * from "./memory/MemoryExternalConnectorRepository.js";
export * from "./memory/MemoryBusinessSignalSourceRepository.js";
export * from "./memory/MemoryAuthorityGrantRepository.js";

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export * from "./errors/StorageError.js";
export * from "./errors/PostgresErrorCodes.js";

export * from "./postgres/PostgresStorageProvider.js";
export * from "./postgres/PostgresBusinessTransactionRepository.js";
export * from "./postgres/PostgresExecutionTrustRecordRepository.js";
export * from "./postgres/PostgresExecutionIntentRepository.js";
export * from "./postgres/PostgresRefusalRecordRepository.js";
export * from "./postgres/PostgresInboundDecisionRepository.js";
export * from "./postgres/PostgresInboundCheckRepository.js";
export * from "./postgres/PostgresInboundOutcomeRepository.js";
export * from "./postgres/PostgresPendingPolicyChangeRepository.js";
export * from "./postgres/PostgresPolicyChangeApprovalRecordRepository.js";
export * from "./postgres/PostgresHandbookDownloadLeadRepository.js";
export * from "./postgres/PostgresApprovalIssuerRepository.js";
export * from "./postgres/PostgresCallerKeyRevocationRepository.js";
export * from "./postgres/PostgresExternalConnectorRepository.js";
export * from "./postgres/PostgresBusinessSignalSourceRepository.js";
export * from "./postgres/PostgresAuthorityGrantRepository.js";
export * from "./postgres/PostgresNonceStore.js";
export * from "./postgres/PostgresExecutionOutcomeStore.js";
export * from "./postgres/PostgresApprovalNonceStore.js";
export * from "./postgres/PostgresPolicyChangeStepUpNonceStore.js";
export * from "./postgres/PostgresExecutionAuditSink.js";

// -----------------------------------------------------------------------------
// Postgres (direct connection, bypassing PostgREST)
// -----------------------------------------------------------------------------

export * from "./postgres/PostgresPoolFactory.js";
export * from "./postgres/PostgresChallengeRecordRepository.js";
export * from "./postgres/PostgresRateLimitStore.js";
