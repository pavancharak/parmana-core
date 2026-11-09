import type {
  ApprovalIssuerRepository,
  CallerKeyRevocationRepository,
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
  ExecutionAuditSink,
} from "@parmana/shared";

import type { StorageProvider } from "../StorageProvider.js";

import { PostgresPoolFactory } from "../postgres/PostgresPoolFactory.js";

import { PostgresExecutionAuditSink } from "../postgres/PostgresExecutionAuditSink.js";

import { PostgresBusinessTransactionRepository } from "./PostgresBusinessTransactionRepository.js";

import { PostgresExecutionTrustRecordRepository } from "./PostgresExecutionTrustRecordRepository.js";

import { PostgresExecutionIntentRepository } from "./PostgresExecutionIntentRepository.js";
import { PostgresRefusalRecordRepository } from "./PostgresRefusalRecordRepository.js";
import { PostgresInboundCheckRepository } from "./PostgresInboundCheckRepository.js";
import { PostgresInboundDecisionRepository } from "./PostgresInboundDecisionRepository.js";
import { PostgresInboundOutcomeRepository } from "./PostgresInboundOutcomeRepository.js";

import { PostgresPendingPolicyChangeRepository } from "./PostgresPendingPolicyChangeRepository.js";

import { PostgresPolicyChangeApprovalRecordRepository } from "./PostgresPolicyChangeApprovalRecordRepository.js";

import { PostgresHandbookDownloadLeadRepository } from "./PostgresHandbookDownloadLeadRepository.js";

import { PostgresApprovalIssuerRepository } from "./PostgresApprovalIssuerRepository.js";
import { PostgresCallerKeyRevocationRepository } from "./PostgresCallerKeyRevocationRepository.js";
import { PostgresExternalConnectorRepository } from "./PostgresExternalConnectorRepository.js";
import { PostgresBusinessSignalSourceRepository } from "./PostgresBusinessSignalSourceRepository.js";
import { PostgresAuthorityGrantRepository } from "./PostgresAuthorityGrantRepository.js";

/**
 * Supabase Storage Provider.
 *
 * Wires all three repositories to a single, shared PostgresPoolFactory
 * pool (DATABASE_URL) — a direct Postgres connection, not a
 * supabase-js/PostgREST client. This removes PostgREST from the
 * failure modes of every table this provider touches (business
 * transactions, execution trust records and their sub-collections,
 * refusal records), not just the audit sinks that broke first (see
 * PostgresCallerAuditSink for the originating incident).
 */
export class PostgresStorageProvider implements StorageProvider {
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
  readonly externalConnectors: ExternalConnectorRepository;
  readonly businessSignalSources: BusinessSignalSourceRepository;
  readonly authorityGrants: AuthorityGrantRepository;
  readonly executionAuditSink: ExecutionAuditSink;

  constructor() {
    const pool = PostgresPoolFactory.create();

    this.executionAuditSink = new PostgresExecutionAuditSink(pool);

    this.businessTransactions = new PostgresBusinessTransactionRepository(pool);

    this.trustRecords = new PostgresExecutionTrustRecordRepository(pool);

    this.refusalRecords = new PostgresRefusalRecordRepository(pool);
    this.inboundDecisions = new PostgresInboundDecisionRepository(pool);
    this.inboundChecks = new PostgresInboundCheckRepository(pool);
    this.inboundOutcomes = new PostgresInboundOutcomeRepository(pool);

    this.executionIntents = new PostgresExecutionIntentRepository(pool);

    this.pendingPolicyChanges = new PostgresPendingPolicyChangeRepository(pool);

    this.policyChangeApprovalRecords =
      new PostgresPolicyChangeApprovalRecordRepository(pool);

    this.handbookDownloadLeads = new PostgresHandbookDownloadLeadRepository(
      pool,
    );

    this.approvalIssuers = new PostgresApprovalIssuerRepository(pool);
    this.callerKeyRevocations = new PostgresCallerKeyRevocationRepository(pool);

    this.externalConnectors = new PostgresExternalConnectorRepository(pool);
    this.businessSignalSources = new PostgresBusinessSignalSourceRepository(
      pool,
    );
    this.authorityGrants = new PostgresAuthorityGrantRepository(pool);

    Object.freeze(this);
  }
}
