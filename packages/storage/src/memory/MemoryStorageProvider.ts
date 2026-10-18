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

import type { StorageProvider } from "../StorageProvider.js";

import { MemoryBusinessTransactionRepository } from "./MemoryBusinessTransactionRepository.js";

import { MemoryExecutionTrustRecordRepository } from "./MemoryExecutionTrustRecordRepository.js";

import { MemoryExecutionIntentRepository } from "./MemoryExecutionIntentRepository.js";
import { MemoryRefusalRecordRepository } from "./MemoryRefusalRecordRepository.js";

import { MemoryPendingPolicyChangeRepository } from "./MemoryPendingPolicyChangeRepository.js";

import { MemoryPolicyChangeApprovalRecordRepository } from "./MemoryPolicyChangeApprovalRecordRepository.js";

import { MemoryHandbookDownloadLeadRepository } from "./MemoryHandbookDownloadLeadRepository.js";

import { MemoryApprovalIssuerRepository } from "./MemoryApprovalIssuerRepository.js";
import { MemoryExternalConnectorRepository } from "./MemoryExternalConnectorRepository.js";
import { MemoryBusinessSignalSourceRepository } from "./MemoryBusinessSignalSourceRepository.js";
import { MemoryAuthorityGrantRepository } from "./MemoryAuthorityGrantRepository.js";

/**
 * Memory Storage Provider.
 *
 * Provides in-memory repository implementations
 * for development, testing, and local execution.
 */
export class MemoryStorageProvider implements StorageProvider {
  readonly businessTransactions: BusinessTransactionRepository;

  readonly trustRecords: ExecutionTrustRecordRepository;

  readonly refusalRecords: RefusalRecordRepository;

  readonly executionIntents: ExecutionIntentRepository;

  readonly pendingPolicyChanges: PendingPolicyChangeRepository;

  readonly policyChangeApprovalRecords: PolicyChangeApprovalRecordRepository;

  readonly handbookDownloadLeads: HandbookDownloadLeadRepository;

  readonly approvalIssuers: ApprovalIssuerRepository;

  readonly externalConnectors: ExternalConnectorRepository;
  readonly businessSignalSources: BusinessSignalSourceRepository;
  readonly authorityGrants: AuthorityGrantRepository;

  constructor() {
    this.businessTransactions = new MemoryBusinessTransactionRepository();

    this.trustRecords = new MemoryExecutionTrustRecordRepository();

    this.refusalRecords = new MemoryRefusalRecordRepository();

    this.executionIntents = new MemoryExecutionIntentRepository();

    this.pendingPolicyChanges = new MemoryPendingPolicyChangeRepository();

    this.policyChangeApprovalRecords =
      new MemoryPolicyChangeApprovalRecordRepository();

    this.handbookDownloadLeads = new MemoryHandbookDownloadLeadRepository();

    this.approvalIssuers = new MemoryApprovalIssuerRepository();

    this.externalConnectors = new MemoryExternalConnectorRepository();
    this.businessSignalSources = new MemoryBusinessSignalSourceRepository();
    this.authorityGrants = new MemoryAuthorityGrantRepository();

    Object.freeze(this);
  }
}
