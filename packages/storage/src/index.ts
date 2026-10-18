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

export * from "./memory/MemoryBusinessTransactionRepository.js";
export * from "./memory/MemoryExecutionTrustRecordRepository.js";
export * from "./memory/MemoryExecutionIntentRepository.js";
export * from "./memory/MemoryRefusalRecordRepository.js";
export * from "./memory/MemoryChallengeRecordRepository.js";
export * from "./memory/MemoryPolicyRepository.js";
export * from "./memory/MemoryPendingPolicyChangeRepository.js";
export * from "./memory/MemoryPolicyChangeApprovalRecordRepository.js";
export * from "./memory/MemoryHandbookDownloadLeadRepository.js";
export * from "./memory/MemoryApprovalIssuerRepository.js";
export * from "./memory/MemoryExternalConnectorRepository.js";
export * from "./memory/MemoryBusinessSignalSourceRepository.js";
export * from "./memory/MemoryAuthorityGrantRepository.js";

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export * from "./errors/StorageError.js";
export * from "./errors/PostgresErrorCodes.js";

export * from "./supabase/SupabaseStorageProvider.js";
export * from "./supabase/SupabaseBusinessTransactionRepository.js";
export * from "./supabase/SupabaseExecutionTrustRecordRepository.js";
export * from "./supabase/SupabaseExecutionIntentRepository.js";
export * from "./supabase/SupabaseRefusalRecordRepository.js";
export * from "./supabase/SupabasePendingPolicyChangeRepository.js";
export * from "./supabase/SupabasePolicyChangeApprovalRecordRepository.js";
export * from "./supabase/SupabaseHandbookDownloadLeadRepository.js";
export * from "./supabase/SupabaseApprovalIssuerRepository.js";
export * from "./supabase/SupabaseExternalConnectorRepository.js";
export * from "./supabase/SupabaseBusinessSignalSourceRepository.js";
export * from "./supabase/SupabaseAuthorityGrantRepository.js";
export * from "./supabase/SupabaseNonceStore.js";
export * from "./supabase/SupabaseApprovalNonceStore.js";
export * from "./supabase/SupabasePolicyChangeStepUpNonceStore.js";
export * from "./supabase/SupabaseExecutionAuditSink.js";

// -----------------------------------------------------------------------------
// Postgres (direct connection, bypassing PostgREST)
// -----------------------------------------------------------------------------

export * from "./postgres/PostgresPoolFactory.js";
export * from "./postgres/PostgresChallengeRecordRepository.js";
export * from "./postgres/PostgresRateLimitStore.js";
