/**
 * Parmana SDK
 *
 * Authority Grant API.
 *
 * Per-agent authority (RFC-0023 phase 3): list the grants, propose
 * granting an agent's key authority for a capability, within limits,
 * until an expiry, or revoking it, and approve or reject a proposal with
 * a signed step up authorization. Every call needs an API key that
 * belongs to a verified human.
 */

import type { Transport } from "../config/Transport.js";

import type {
  AuthorityGrant,
  AuthorityGrantChange,
  ProposeAuthorityGrantChangeInput,
} from "../models/authority-grant.js";
import type {
  PendingPolicyChangeStatus,
  PolicyChangeStepUpAuthorization,
} from "../models/policy-change.js";

export class AuthorityGrantApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Every grant, active and revoked. Maps to GET
   * /authority-grants.
   */
  public async list(): Promise<AuthorityGrant[]> {
    const response = await this.transport.send<{
      grants: AuthorityGrant[];
    }>({
      method: "GET",
      path: "/authority-grants",
    });

    return response.body.grants;
  }

  /**
   * Proposes granting or revoking an agent's authority. Nothing
   * changes until a different person approves it. Maps to POST
   * /authority-grants/changes.
   */
  public async proposeChange(
    input: ProposeAuthorityGrantChangeInput,
  ): Promise<AuthorityGrantChange> {
    const response = await this.transport.send<AuthorityGrantChange>({
      method: "POST",
      path: "/authority-grants/changes",
      body: input,
    });

    return response.body;
  }

  /**
   * Lists authority grant changes, newest first. Maps to GET
   * /authority-grants/changes.
   *
   * @param status Only changes in this state. Omit for all.
   */
  public async listChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<AuthorityGrantChange[]> {
    const response = await this.transport.send<{
      changes: AuthorityGrantChange[];
    }>({
      method: "GET",
      path:
        status === undefined
          ? "/authority-grants/changes"
          : `/authority-grants/changes?status=${encodeURIComponent(status)}`,
    });

    return response.body.changes;
  }

  /**
   * Approves and applies an authority grant change. Maps to POST
   * /authority-grants/changes/{id}/approve. The caller must not be the
   * proposer and must have a registered step up key. Make
   * `stepUpAuthorization` with `signPolicyChangeStepUp()`, the change id
   * as `pendingPolicyChangeId`, and action "approve".
   */
  public async approveChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<AuthorityGrantChange> {
    const response = await this.transport.send<AuthorityGrantChange>({
      method: "POST",
      path: `/authority-grants/changes/${encodeURIComponent(changeId)}/approve`,
      body: { stepUpAuthorization },
    });

    return response.body;
  }

  /**
   * Rejects an authority grant change. Same caller rules as
   * approveChange(); sign with action "reject". A reason is required.
   */
  public async rejectChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<AuthorityGrantChange> {
    const response = await this.transport.send<AuthorityGrantChange>({
      method: "POST",
      path: `/authority-grants/changes/${encodeURIComponent(changeId)}/reject`,
      body: { rejectionReason, stepUpAuthorization },
    });

    return response.body;
  }
}
