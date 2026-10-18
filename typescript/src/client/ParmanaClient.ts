/**
 * Parmana SDK
 *
 * Canonical SDK client.
 *
 * ParmanaClient is the primary entry point for interacting
 * with the Parmana Runtime.
 *
 * Responsibilities:
 * - Hold immutable SDK configuration.
 * - Compose SDK APIs.
 * - Delegate SDK operations.
 *
 * ParmanaClient does NOT:
 * - evaluate policy
 * - authorize execution
 * - execute business logic
 * - verify trust records
 * - replay executions
 * - communicate directly with the Runtime
 */

import type {
  AuditEvent,
  BusinessTransaction,
  ExecutionTrustRecord,
  Receipt,
  RefusalRecord,
  ExecutionIntent,
  ExecutionIntentView,
  FinalizeExecutionIntentResult,
  ResolveExecutionIntentInput,
  ResolveExecutionIntentResult,
  UnfinalizedExecutionIntents,
  Signature,
  Verification,
} from "../models/index.js";

import type { ReplayResult } from "../models/replay-result.js";
import type { CallerIdentity, PublicKeyInfo } from "../models/caller.js";
import type { PolicyInEffect } from "../models/policy-in-effect.js";
import type {
  ApprovalIssuer,
  ApprovalIssuerChange,
  ProposeApproverChangeInput,
} from "../models/approval-issuer.js";
import type {
  ExternalConnector,
  ExternalConnectorChange,
  ProposeExternalConnectorChangeInput,
} from "../models/external-connector.js";
import type {
  BusinessSignalSource,
  BusinessSignalSourceChange,
  ProposeBusinessSignalSourceChangeInput,
} from "../models/business-signal-source.js";
import type {
  AuthorityGrant,
  AuthorityGrantChange,
  ProposeAuthorityGrantChangeInput,
} from "../models/authority-grant.js";
import type {
  PendingPolicyChange,
  PendingPolicyChangeStatus,
  PolicyChangeForReview,
  PolicyChangeStepUpAuthorization,
  ProposePolicyChangeInput,
  ProposedPolicyChange,
} from "../models/policy-change.js";

import type { Configuration } from "../config/Configuration.js";
import { assertSafeEndpoint } from "../config/assertSafeEndpoint.js";

import type { Transport } from "../config/Transport.js";

import { ConfigurationError } from "../errors/ConfigurationError.js";

import { HttpTransport } from "../transport/HttpTransport.js";

import { HealthApi, type HealthStatus } from "./HealthApi.js";

import { ExecutionApi } from "./ExecutionApi.js";

import { VerificationApi } from "./VerificationApi.js";

import { ReplayApi } from "./ReplayApi.js";

import { ReceiptApi } from "./ReceiptApi.js";

import { TransactionApi } from "./TransactionApi.js";

import { TrustRecordApi } from "./TrustRecordApi.js";

import { PolicyApi, type PolicyValidationResult } from "./PolicyApi.js";
import { ApproverApi } from "./ApproverApi.js";
import { ExternalConnectorApi } from "./ExternalConnectorApi.js";
import { BusinessSignalSourceApi } from "./BusinessSignalSourceApi.js";
import { AuthorityGrantApi } from "./AuthorityGrantApi.js";

import { RefusalApi } from "./RefusalApi.js";
import { ExecutionIntentApi } from "./ExecutionIntentApi.js";

import { AuditApi } from "./AuditApi.js";
import { CallerApi } from "./CallerApi.js";

/**
 * Canonical Parmana SDK client.
 */
export class ParmanaClient {
  /**
   * Immutable SDK configuration.
   */
  public readonly configuration: Configuration;

  /**
   * Configured transport.
   */
  private readonly transport: Transport;

  /**
   * Runtime Health API.
   */
  private readonly healthApi: HealthApi;

  /**
   * Runtime Execution API.
   */
  private readonly executionApi: ExecutionApi;

  /**
   * Runtime Verification API.
   */
  private readonly verificationApi: VerificationApi;

  /**
   * Runtime Replay API.
   */
  private readonly replayApi: ReplayApi;

  /**
   * Runtime Receipt API.
   */
  private readonly receiptApi: ReceiptApi;

  /**
   * Runtime Transaction API.
   */
  private readonly transactionApi: TransactionApi;

  /**
   * Runtime Trust Record API.
   */
  private readonly trustRecordApi: TrustRecordApi;

  /**
   * Runtime Policy API.
   */
  private readonly policyApi: PolicyApi;

  private readonly approverApi: ApproverApi;

  private readonly externalConnectorApi: ExternalConnectorApi;

  private readonly businessSignalSourceApi: BusinessSignalSourceApi;

  private readonly authorityGrantApi: AuthorityGrantApi;

  /**
   * Runtime Refusal Record API.
   */
  private readonly refusalApi: RefusalApi;

  /**
   * Runtime Execution Intent API (ADR-0012).
   */
  private readonly executionIntentApi: ExecutionIntentApi;

  /**
   * Runtime Audit Event API.
   */
  private readonly auditApi: AuditApi;

  private readonly callerApi: CallerApi;

  /**
   * Creates a Parmana SDK client.
   */
  /**
   * Keeps the API key out of console.log and JSON.stringify output. The
   * configuration object still holds it, since the transport needs it.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `ParmanaClient { endpoint: ${JSON.stringify(this.configuration.endpoint)} }`;
  }

  toJSON(): { endpoint: string } {
    return { endpoint: this.configuration.endpoint };
  }

  constructor(configuration: Configuration) {
    if (!configuration.endpoint) {
      throw new ConfigurationError("Runtime endpoint is required.");
    }

    assertSafeEndpoint(configuration.endpoint);

    this.configuration = configuration;
    this.transport =
      configuration.transport ?? new HttpTransport(configuration);

    //
    // Compose SDK APIs.
    //
    this.healthApi = new HealthApi(this.transport);

    this.executionApi = new ExecutionApi(this.transport);

    this.verificationApi = new VerificationApi(this.transport);

    this.replayApi = new ReplayApi(this.transport);

    this.receiptApi = new ReceiptApi(this.transport);

    this.transactionApi = new TransactionApi(this.transport);

    this.trustRecordApi = new TrustRecordApi(this.transport);

    this.policyApi = new PolicyApi(this.transport);

    this.approverApi = new ApproverApi(this.transport);

    this.externalConnectorApi = new ExternalConnectorApi(this.transport);
    this.businessSignalSourceApi = new BusinessSignalSourceApi(this.transport);
    this.authorityGrantApi = new AuthorityGrantApi(this.transport);

    this.refusalApi = new RefusalApi(this.transport);

    this.executionIntentApi = new ExecutionIntentApi(this.transport);

    this.auditApi = new AuditApi(this.transport);

    this.callerApi = new CallerApi(this.transport);
  }

  /**
   * Returns the configured Runtime endpoint.
   */
  public endpoint(): string {
    return this.configuration.endpoint;
  }

  /**
   * Performs a Runtime health check.
   */
  public health(): Promise<HealthStatus> {
    return this.healthApi.health();
  }

  /**
   * Returns the Runtime name, version, and API version.
   */
  public version(): Promise<unknown> {
    return this.executionApi.version();
  }

  /**
   * Executes a Business Transaction.
   */
  public execute(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    return this.executionApi.execute(transaction);
  }

  /**
   * Runs a fresh verification of an Execution Trust Record, appending a
   * new Verification to its history. Distinct from
   * getLatestVerification(), which reads the most recent one without
   * re-verifying.
   */
  public verify(businessTransactionId: string): Promise<Verification> {
    return this.verificationApi.verify(businessTransactionId);
  }

  /**
   * Returns the latest Verification.
   */
  public getLatestVerification(
    businessTransactionId: string,
  ): Promise<Verification> {
    return this.verificationApi.getLatest(businessTransactionId);
  }

  /**
   * Performs deterministic replay.
   */
  public replay(businessTransactionId: string): Promise<ReplayResult> {
    return this.replayApi.replay(businessTransactionId);
  }

  /**
   * Generates an execution receipt.
   */
  public receipt(businessTransactionId: string): Promise<Receipt> {
    return this.receiptApi.generate(businessTransactionId);
  }

  /**
   * Creates (executes) a Business Transaction via POST /transactions,
   * a second, independent entry point into the identical execution
   * pipeline as execute() (POST /execute). See TransactionApi.create.
   */
  public createTransaction(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    return this.transactionApi.create(transaction);
  }

  /**
   * Retrieves a Business Transaction.
   */
  public transaction(
    businessTransactionId: string,
  ): Promise<BusinessTransaction> {
    return this.transactionApi.get(businessTransactionId);
  }

  /**
   * Lists Business Transactions.
   */
  public transactions(page = 1, pageSize = 25): Promise<BusinessTransaction[]> {
    return this.transactionApi.list(page, pageSize);
  }

  /**
   * Retrieves the most recent receipt without generating a new one.
   */
  public latestReceipt(businessTransactionId: string): Promise<Receipt> {
    return this.receiptApi.getLatest(businessTransactionId);
  }

  /**
   * Retrieves an Execution Trust Record.
   */
  public trustRecord(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord> {
    return this.trustRecordApi.get(businessTransactionId);
  }

  /**
   * Lists Execution Trust Records of this caller's transactions, newest
   * first. See TrustRecordApi.list.
   */
  public trustRecords(
    page = 1,
    pageSize = 25,
    options: { readonly since?: string; readonly until?: string } = {},
  ): Promise<ExecutionTrustRecord[]> {
    return this.trustRecordApi.list(page, pageSize, options);
  }

  /**
   * Who this API key belongs to and what it may do (GET /callers/me).
   */
  public caller(): Promise<CallerIdentity> {
    return this.callerApi.me();
  }

  /**
   * A signing public key of the deployment (GET /keys/{keyId}), for the
   * offline verifiers. Records are signed with `default`.
   */
  public publicKey(keyId = "default"): Promise<PublicKeyInfo> {
    return this.callerApi.publicKey(keyId);
  }

  /**
   * The policy a request for `capability` must declare right now, and what
   * the request must carry (GET /policies/in-effect). Call it before every
   * request and declare `policy` exactly as returned.
   */
  public policyInEffect(capability: string): Promise<PolicyInEffect> {
    return this.policyApi.inEffect(capability);
  }

  /**
   * Confirms that a policy (name + version) is loadable by the Runtime.
   */
  public validatePolicy(
    policyId: string,
    policyVersion: string,
  ): Promise<PolicyValidationResult> {
    return this.policyApi.validate(policyId, policyVersion);
  }

  /**
   * Retrieves a Refusal Record by Business Transaction ID.
   */
  public refusalRecord(businessTransactionId: string): Promise<RefusalRecord> {
    return this.refusalApi.get(businessTransactionId);
  }

  /**
   * Verifies a Refusal Record's signature.
   */
  public verifyRefusalRecord(record: RefusalRecord): Promise<boolean> {
    return this.refusalApi.verify(record);
  }

  /**
   * Retrieves an Execution Intent and its status by Business Transaction ID
   * (ADR-0012). The intent is the signed statement, stored before an action is
   * released, of what was about to be released.
   */
  public executionIntent(
    businessTransactionId: string,
  ): Promise<ExecutionIntentView> {
    return this.executionIntentApi.get(businessTransactionId);
  }

  /**
   * Verifies an Execution Intent's hash and signature. Needs no credential.
   * `true` proves the intent is genuine and unaltered. It does not prove the
   * action was released, or what its result was.
   */
  public verifyExecutionIntent(intent: ExecutionIntent): Promise<boolean> {
    return this.executionIntentApi.verify(intent);
  }

  /**
   * Lists Execution Intents that never reached a signed Trust Record and were
   * not closed by hand, oldest first. Needs a credential provisioned as a
   * verified human.
   */
  public unfinalizedExecutionIntents(
    limit?: number,
  ): Promise<UnfinalizedExecutionIntents> {
    return this.executionIntentApi.listUnfinalized(limit);
  }

  /**
   * Rebuilds the signed Trust Record for a released action whose record was
   * never produced. Never calls a connector. Safe to run twice. Needs a
   * credential provisioned as a verified human.
   */
  public finalizeExecutionIntent(
    businessTransactionId: string,
  ): Promise<FinalizeExecutionIntentResult> {
    return this.executionIntentApi.finalize(businessTransactionId);
  }

  /**
   * Closes a PREPARED or ERRORED intent that a verified human reconciled at the
   * connector. The note is required. The resolution is an attributed operator
   * statement in unsigned status, not a Trust Record.
   */
  public resolveExecutionIntent(
    businessTransactionId: string,
    input: ResolveExecutionIntentInput,
  ): Promise<ResolveExecutionIntentResult> {
    return this.executionIntentApi.resolve(businessTransactionId, input);
  }

  /**
   * Verifies a signed caller-authentication audit event's signature.
   */
  public verifyAuditEvent(
    event: AuditEvent,
    signature: Signature,
  ): Promise<boolean> {
    return this.auditApi.verify(event, signature);
  }

  /**
   * Proposes a policy change. See PolicyApi.proposeChange.
   */
  public proposePolicyChange(
    name: string,
    version: string,
    input: ProposePolicyChangeInput,
  ): Promise<ProposedPolicyChange> {
    return this.policyApi.proposeChange(name, version, input);
  }

  /**
   * Lists policy changes for review. See PolicyApi.listChanges.
   */
  public policyChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<PolicyChangeForReview[]> {
    return this.policyApi.listChanges(status);
  }

  /**
   * Approves a policy change with a signed step up authorization. See
   * PolicyApi.approveChange and signPolicyChangeStepUp().
   */
  public approvePolicyChange(
    pendingPolicyChangeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<PendingPolicyChange> {
    return this.policyApi.approveChange(
      pendingPolicyChangeId,
      stepUpAuthorization,
    );
  }

  /**
   * Rejects a policy change with a reason and a signed step up
   * authorization. See PolicyApi.rejectChange.
   */
  public rejectPolicyChange(
    pendingPolicyChangeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<PendingPolicyChange> {
    return this.policyApi.rejectChange(
      pendingPolicyChangeId,
      rejectionReason,
      stepUpAuthorization,
    );
  }

  /**
   * Every approver key the server trusts or trusted. See ApproverApi.list.
   */
  public approvers(): Promise<ApprovalIssuer[]> {
    return this.approverApi.list();
  }

  /**
   * Proposes adding or revoking an approver key. See
   * ApproverApi.proposeChange.
   */
  public proposeApproverChange(
    input: ProposeApproverChangeInput,
  ): Promise<ApprovalIssuerChange> {
    return this.approverApi.proposeChange(input);
  }

  /**
   * Lists approver changes. See ApproverApi.listChanges.
   */
  public approverChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<ApprovalIssuerChange[]> {
    return this.approverApi.listChanges(status);
  }

  /**
   * Approves and applies an approver change. See ApproverApi.approveChange.
   */
  public approveApproverChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ApprovalIssuerChange> {
    return this.approverApi.approveChange(changeId, stepUpAuthorization);
  }

  /**
   * Rejects an approver change. See ApproverApi.rejectChange.
   */
  public rejectApproverChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ApprovalIssuerChange> {
    return this.approverApi.rejectChange(
      changeId,
      rejectionReason,
      stepUpAuthorization,
    );
  }
  /**
   * Every external connector registration, active and revoked. See
   * ExternalConnectorApi.list.
   */
  public externalConnectors(): Promise<ExternalConnector[]> {
    return this.externalConnectorApi.list();
  }

  /**
   * Proposes registering or revoking an external connector. See
   * ExternalConnectorApi.proposeChange.
   */
  public proposeExternalConnectorChange(
    input: ProposeExternalConnectorChangeInput,
  ): Promise<ExternalConnectorChange> {
    return this.externalConnectorApi.proposeChange(input);
  }

  /**
   * Lists external connector changes. See ExternalConnectorApi.listChanges.
   */
  public externalConnectorChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<ExternalConnectorChange[]> {
    return this.externalConnectorApi.listChanges(status);
  }

  /**
   * Approves and applies an external connector change. See
   * ExternalConnectorApi.approveChange.
   */
  public approveExternalConnectorChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ExternalConnectorChange> {
    return this.externalConnectorApi.approveChange(
      changeId,
      stepUpAuthorization,
    );
  }

  /**
   * Rejects an external connector change. See
   * ExternalConnectorApi.rejectChange.
   */
  public rejectExternalConnectorChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ExternalConnectorChange> {
    return this.externalConnectorApi.rejectChange(
      changeId,
      rejectionReason,
      stepUpAuthorization,
    );
  }

  /**
   * Every business signal source registration, active and revoked. See
   * BusinessSignalSourceApi.list.
   */
  public businessSignalSources(): Promise<BusinessSignalSource[]> {
    return this.businessSignalSourceApi.list();
  }

  /**
   * Proposes registering or revoking a business signal source. See
   * BusinessSignalSourceApi.proposeChange.
   */
  public proposeBusinessSignalSourceChange(
    input: ProposeBusinessSignalSourceChangeInput,
  ): Promise<BusinessSignalSourceChange> {
    return this.businessSignalSourceApi.proposeChange(input);
  }

  /**
   * Lists business signal source changes. See
   * BusinessSignalSourceApi.listChanges.
   */
  public businessSignalSourceChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<BusinessSignalSourceChange[]> {
    return this.businessSignalSourceApi.listChanges(status);
  }

  /**
   * Approves and applies a business signal source change. See
   * BusinessSignalSourceApi.approveChange.
   */
  public approveBusinessSignalSourceChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<BusinessSignalSourceChange> {
    return this.businessSignalSourceApi.approveChange(
      changeId,
      stepUpAuthorization,
    );
  }

  /**
   * Rejects a business signal source change. See
   * BusinessSignalSourceApi.rejectChange.
   */
  public rejectBusinessSignalSourceChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<BusinessSignalSourceChange> {
    return this.businessSignalSourceApi.rejectChange(
      changeId,
      rejectionReason,
      stepUpAuthorization,
    );
  }

  /**
   * Every authority grant, active and revoked. See AuthorityGrantApi.list.
   */
  public authorityGrants(): Promise<AuthorityGrant[]> {
    return this.authorityGrantApi.list();
  }

  /**
   * Proposes granting or revoking an agent's authority. See
   * AuthorityGrantApi.proposeChange.
   */
  public proposeAuthorityGrantChange(
    input: ProposeAuthorityGrantChangeInput,
  ): Promise<AuthorityGrantChange> {
    return this.authorityGrantApi.proposeChange(input);
  }

  /**
   * Lists authority grant changes. See AuthorityGrantApi.listChanges.
   */
  public authorityGrantChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<AuthorityGrantChange[]> {
    return this.authorityGrantApi.listChanges(status);
  }

  /**
   * Approves and applies an authority grant change. See
   * AuthorityGrantApi.approveChange.
   */
  public approveAuthorityGrantChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<AuthorityGrantChange> {
    return this.authorityGrantApi.approveChange(changeId, stepUpAuthorization);
  }

  /**
   * Rejects an authority grant change. See AuthorityGrantApi.rejectChange.
   */
  public rejectAuthorityGrantChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<AuthorityGrantChange> {
    return this.authorityGrantApi.rejectChange(
      changeId,
      rejectionReason,
      stepUpAuthorization,
    );
  }
}
