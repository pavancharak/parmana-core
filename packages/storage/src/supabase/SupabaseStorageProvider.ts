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

import { SupabaseBusinessTransactionRepository } from "./SupabaseBusinessTransactionRepository.js";

import { SupabaseExecutionTrustRecordRepository } from "./SupabaseExecutionTrustRecordRepository.js";

import { SupabaseExecutionIntentRepository } from "./SupabaseExecutionIntentRepository.js";
import { SupabaseRefusalRecordRepository } from "./SupabaseRefusalRecordRepository.js";
import { SupabaseInboundCheckRepository } from "./SupabaseInboundCheckRepository.js";
import { SupabaseInboundDecisionRepository } from "./SupabaseInboundDecisionRepository.js";
import { SupabaseInboundOutcomeRepository } from "./SupabaseInboundOutcomeRepository.js";

import { SupabasePendingPolicyChangeRepository } from "./SupabasePendingPolicyChangeRepository.js";

import { SupabasePolicyChangeApprovalRecordRepository } from "./SupabasePolicyChangeApprovalRecordRepository.js";

import { SupabaseHandbookDownloadLeadRepository } from "./SupabaseHandbookDownloadLeadRepository.js";

import { SupabaseApprovalIssuerRepository } from "./SupabaseApprovalIssuerRepository.js";
import { SupabaseCallerKeyRevocationRepository } from "./SupabaseCallerKeyRevocationRepository.js";
import { SupabaseExternalConnectorRepository } from "./SupabaseExternalConnectorRepository.js";
import { SupabaseBusinessSignalSourceRepository } from "./SupabaseBusinessSignalSourceRepository.js";
import { SupabaseAuthorityGrantRepository } from "./SupabaseAuthorityGrantRepository.js";

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
export class SupabaseStorageProvider implements StorageProvider {
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

    this.businessTransactions = new SupabaseBusinessTransactionRepository(pool);

    this.trustRecords = new SupabaseExecutionTrustRecordRepository(pool);

    this.refusalRecords = new SupabaseRefusalRecordRepository(pool);
    this.inboundDecisions = new SupabaseInboundDecisionRepository(pool);
    this.inboundChecks = new SupabaseInboundCheckRepository(pool);
    this.inboundOutcomes = new SupabaseInboundOutcomeRepository(pool);

    this.executionIntents = new SupabaseExecutionIntentRepository(pool);

    this.pendingPolicyChanges = new SupabasePendingPolicyChangeRepository(pool);

    this.policyChangeApprovalRecords =
      new SupabasePolicyChangeApprovalRecordRepository(pool);

    this.handbookDownloadLeads = new SupabaseHandbookDownloadLeadRepository(
      pool,
    );

    this.approvalIssuers = new SupabaseApprovalIssuerRepository(pool);
    this.callerKeyRevocations = new SupabaseCallerKeyRevocationRepository(pool);

    this.externalConnectors = new SupabaseExternalConnectorRepository(pool);
    this.businessSignalSources = new SupabaseBusinessSignalSourceRepository(
      pool,
    );
    this.authorityGrants = new SupabaseAuthorityGrantRepository(pool);

    Object.freeze(this);
  }
}
