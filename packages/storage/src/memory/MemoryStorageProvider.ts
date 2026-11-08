import type {
  ApprovalIssuerRepository,
  CallerKeyRevocationRepository,
  AgentRegistryRepository,
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
  InboundCheckRepository,
  InboundDecisionRepository,
  InboundOutcomeRepository,
} from "@parmana/shared";

import type { StorageProvider } from "../StorageProvider.js";

import { MemoryBusinessTransactionRepository } from "./MemoryBusinessTransactionRepository.js";

import { MemoryExecutionTrustRecordRepository } from "./MemoryExecutionTrustRecordRepository.js";

import { MemoryExecutionIntentRepository } from "./MemoryExecutionIntentRepository.js";
import { MemoryRefusalRecordRepository } from "./MemoryRefusalRecordRepository.js";
import { MemoryInboundCheckRepository } from "./MemoryInboundCheckRepository.js";
import { MemoryInboundDecisionRepository } from "./MemoryInboundDecisionRepository.js";
import { MemoryInboundOutcomeRepository } from "./MemoryInboundOutcomeRepository.js";

import { MemoryPendingPolicyChangeRepository } from "./MemoryPendingPolicyChangeRepository.js";

import { MemoryPolicyChangeApprovalRecordRepository } from "./MemoryPolicyChangeApprovalRecordRepository.js";

import { MemoryHandbookDownloadLeadRepository } from "./MemoryHandbookDownloadLeadRepository.js";

import { MemoryApprovalIssuerRepository } from "./MemoryApprovalIssuerRepository.js";
import { MemoryCallerKeyRevocationRepository } from "./MemoryCallerKeyRevocationRepository.js";
import { MemoryAgentRegistryRepository } from "./MemoryAgentRegistryRepository.js";
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
  readonly inboundDecisions: InboundDecisionRepository;
  readonly inboundChecks: InboundCheckRepository;
  readonly inboundOutcomes: InboundOutcomeRepository;

  readonly executionIntents: ExecutionIntentRepository;

  readonly pendingPolicyChanges: PendingPolicyChangeRepository;

  readonly policyChangeApprovalRecords: PolicyChangeApprovalRecordRepository;

  readonly handbookDownloadLeads: HandbookDownloadLeadRepository;

  readonly approvalIssuers: ApprovalIssuerRepository;
  readonly callerKeyRevocations: CallerKeyRevocationRepository;
  readonly agentRegistry: AgentRegistryRepository;

  readonly externalConnectors: ExternalConnectorRepository;
  readonly businessSignalSources: BusinessSignalSourceRepository;
  readonly authorityGrants: AuthorityGrantRepository;

  constructor() {
    this.businessTransactions = new MemoryBusinessTransactionRepository();

    this.trustRecords = new MemoryExecutionTrustRecordRepository();

    this.refusalRecords = new MemoryRefusalRecordRepository();
    this.inboundDecisions = new MemoryInboundDecisionRepository();
    this.inboundChecks = new MemoryInboundCheckRepository();
    this.inboundOutcomes = new MemoryInboundOutcomeRepository();

    this.executionIntents = new MemoryExecutionIntentRepository();

    this.pendingPolicyChanges = new MemoryPendingPolicyChangeRepository();

    this.policyChangeApprovalRecords =
      new MemoryPolicyChangeApprovalRecordRepository();

    this.handbookDownloadLeads = new MemoryHandbookDownloadLeadRepository();

    this.approvalIssuers = new MemoryApprovalIssuerRepository();
    this.callerKeyRevocations = new MemoryCallerKeyRevocationRepository();
    this.agentRegistry = new MemoryAgentRegistryRepository();

    this.externalConnectors = new MemoryExternalConnectorRepository();
    this.businessSignalSources = new MemoryBusinessSignalSourceRepository();
    this.authorityGrants = new MemoryAuthorityGrantRepository();

    Object.freeze(this);
  }
}
