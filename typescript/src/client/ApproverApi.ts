/**
 * Parmana SDK
 *
 * Approver API.
 *
 * Approvers managed without a deploy: list the keys trusted to sign
 * approvals, propose adding or revoking one, and approve or reject a
 * proposal with a signed step up authorization. Every call needs an API
 * key that belongs to a verified human.
 */

import type { Transport } from "../config/Transport.js";

import type {
  ApprovalIssuer,
  ApprovalIssuerChange,
  ProposeApproverChangeInput,
} from "../models/approval-issuer.js";
import type {
  PendingPolicyChangeStatus,
  PolicyChangeStepUpAuthorization,
} from "../models/policy-change.js";

export class ApproverApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Every approver key the server trusts or trusted, revoked ones marked.
   * Maps to GET /approval-issuers.
   */
  public async list(): Promise<ApprovalIssuer[]> {
    const response = await this.transport.send<{ issuers: ApprovalIssuer[] }>({
      method: "GET",
      path: "/approval-issuers",
    });

    return response.body.issuers;
  }

  /**
   * Proposes adding or revoking an approver key. Nothing changes until a
   * different person approves it. Maps to POST /approval-issuers/changes.
   */
  public async proposeChange(
    input: ProposeApproverChangeInput,
  ): Promise<ApprovalIssuerChange> {
    const response = await this.transport.send<ApprovalIssuerChange>({
      method: "POST",
      path: "/approval-issuers/changes",
      body: input,
    });

    return response.body;
  }

  /**
   * Lists approver changes, newest first. Maps to GET
   * /approval-issuers/changes.
   *
   * @param status Only changes in this state. Omit for all.
   */
  public async listChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<ApprovalIssuerChange[]> {
    const response = await this.transport.send<{
      changes: ApprovalIssuerChange[];
    }>({
      method: "GET",
      path:
        status === undefined
          ? "/approval-issuers/changes"
          : `/approval-issuers/changes?status=${encodeURIComponent(status)}`,
    });

    return response.body.changes;
  }

  /**
   * Approves and applies an approver change. Maps to POST
   * /approval-issuers/changes/{id}/approve. The caller must not be the
   * proposer and must have a registered step up key. Make
   * `stepUpAuthorization` with `signPolicyChangeStepUp()`, the change id
   * as `pendingPolicyChangeId`, and action "approve".
   */
  public async approveChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ApprovalIssuerChange> {
    const response = await this.transport.send<ApprovalIssuerChange>({
      method: "POST",
      path: `/approval-issuers/changes/${encodeURIComponent(changeId)}/approve`,
      body: { stepUpAuthorization },
    });

    return response.body;
  }

  /**
   * Rejects an approver change. Same caller rules as approveChange(); sign
   * with action "reject". A reason is required.
   */
  public async rejectChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ApprovalIssuerChange> {
    const response = await this.transport.send<ApprovalIssuerChange>({
      method: "POST",
      path: `/approval-issuers/changes/${encodeURIComponent(changeId)}/reject`,
      body: { rejectionReason, stepUpAuthorization },
    });

    return response.body;
  }
}
