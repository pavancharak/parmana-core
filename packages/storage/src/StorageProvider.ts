import type {
  ApprovalIssuerRepository,
  ApprovalNonceLedger,
  CallerKeyRevocationRepository,
  ExternalConnectorRepository,
  BusinessSignalSourceRepository,
  AuthorityGrantRepository,
  BusinessTransactionRepository,
  ExecutionIntentRepository,
  ExecutionTrustRecordRepository,
  TransactionStatusEventRepository,
  TransactionDeclarationStore,
  TransactionExecutionLock,
  HandbookDownloadLeadRepository,
  PendingPolicyChangeRepository,
  PolicyChangeApprovalRecordRepository,
  RefusalRecordOutboxRepository,
  RefusalRecordRepository,
  InboundCheckRepository,
  InboundDecisionRepository,
  InboundOutcomeRepository,
  ExecutionAuditSink,
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
  readonly refusalRecordOutbox: RefusalRecordOutboxRepository;

  /**
   * Inbound refund decisions (RFC-0025).
   */
  readonly inboundDecisions: InboundDecisionRepository;
  readonly inboundChecks: InboundCheckRepository;

  /**
   * Inbound refund outcomes (RFC-0025).
   */
  readonly inboundOutcomes: InboundOutcomeRepository;

  /**
   * Execution Intent repository (ADR-0012).
   */
  readonly executionIntents: ExecutionIntentRepository;

  /**
   * Consumed Approval Artifact nonces (decision D24). The status event that
   * moves a transaction to APPROVED consumes its approvals in the same step.
   */
  readonly approvalNonces: ApprovalNonceLedger;

  /**
   * Transaction status events (decision D23): append-only, one status history
   * per business transaction.
   */
  readonly transactionStatusEvents: TransactionStatusEventRepository;

  /**
   * Stores a declared transaction and its RECEIVED event in one step (design
   * section 3).
   */
  readonly transactionDeclarations: TransactionDeclarationStore;

  /** One lock per transaction, held for each execute (design section 7a, decision 4). */
  readonly transactionExecutionLocks: TransactionExecutionLock;

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

  readonly callerKeyRevocations: CallerKeyRevocationRepository;

  /**
   * External connectors registered through maker checker (ADR-0013).
   */
  readonly externalConnectors: ExternalConnectorRepository;

  readonly businessSignalSources: BusinessSignalSourceRepository;

  /** Authority grants (RFC-0023 phase 3). */
  readonly authorityGrants: AuthorityGrantRepository;

  /**
   * Execution audit trail (GAP-1). Durable in the PostgreSQL provider;
   * process-local in the memory provider. Callers that require a durable
   * trail must check the provider they were given (ADR-0021, step 3).
   */
  readonly executionAuditSink: ExecutionAuditSink;
}
