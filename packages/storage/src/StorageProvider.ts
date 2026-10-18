import type {
  ApprovalIssuerRepository,
  ExternalConnectorRepository,
  BusinessSignalSourceRepository,
  AuthorityGrantRepository,
  BusinessTransactionRepository,
  ExecutionIntentRepository,
  ExecutionTrustRecordRepository,
  HandbookDownloadLeadRepository,
  PendingPolicyChangeRepository,
  PolicyChangeApprovalRecordRepository,
  RefusalRecordRepository,
} from "@parmana/shared";

/**
 * Parmana Storage Provider.
 *
 * Exposes all repository implementations
 * for a storage backend.
 */
export interface StorageProvider {
  /**
   * Business Transaction repository.
   */
  readonly businessTransactions: BusinessTransactionRepository;

  /**
   * Execution Trust Record repository.
   */
  readonly trustRecords: ExecutionTrustRecordRepository;

  /**
   * Refusal Record repository (RFC-0021).
   */
  readonly refusalRecords: RefusalRecordRepository;

  /**
   * Execution Intent repository (ADR-0012).
   */
  readonly executionIntents: ExecutionIntentRepository;

  /**
   * Pending Policy Change repository (Policy Governance,
   * maker-checker).
   */
  readonly pendingPolicyChanges: PendingPolicyChangeRepository;

  /**
   * Policy Change Approval Record repository (Policy Governance,
   * maker-checker).
   */
  readonly policyChangeApprovalRecords: PolicyChangeApprovalRecordRepository;

  /**
   * Handbook download leads (docs/site/handbook/download.mdx).
   */
  readonly handbookDownloadLeads: HandbookDownloadLeadRepository;

  readonly approvalIssuers: ApprovalIssuerRepository;

  /**
   * External connectors registered through maker checker (ADR-0013).
   */
  readonly externalConnectors: ExternalConnectorRepository;

  readonly businessSignalSources: BusinessSignalSourceRepository;

  /** Authority grants (RFC-0023 phase 3). */
  readonly authorityGrants: AuthorityGrantRepository;
}
