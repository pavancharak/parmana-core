/**
 * Parmana SDK
 *
 * Business Signal Source API.
 *
 * Connect a business system Parmana asks for the facts a policy needs
 * (RFC-0023): list the registrations, propose registering a source's
 * HTTPS endpoint and signing key or revoking it, and approve or reject a
 * proposal with a signed step up authorization. Every call needs an API
 * key that belongs to a verified human.
 */

import type { Transport } from "../config/Transport.js";

import type {
  BusinessSignalSource,
  BusinessSignalSourceChange,
  ProposeBusinessSignalSourceChangeInput,
} from "../models/business-signal-source.js";
import type {
  PendingPolicyChangeStatus,
  PolicyChangeStepUpAuthorization,
} from "../models/policy-change.js";

export class BusinessSignalSourceApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Every registration, active and revoked. Maps to GET
   * /business-signal-sources.
   */
  public async list(): Promise<BusinessSignalSource[]> {
    const response = await this.transport.send<{
      sources: BusinessSignalSource[];
    }>({
      method: "GET",
      path: "/business-signal-sources",
    });

    return response.body.sources;
  }

  /**
   * Proposes registering or revoking a business signal source. Nothing
   * changes until a different person approves it. Maps to POST
   * /business-signal-sources/changes.
   */
  public async proposeChange(
    input: ProposeBusinessSignalSourceChangeInput,
  ): Promise<BusinessSignalSourceChange> {
    const response = await this.transport.send<BusinessSignalSourceChange>({
      method: "POST",
      path: "/business-signal-sources/changes",
      body: input,
    });

    return response.body;
  }

  /**
   * Lists business signal source changes, newest first. Maps to GET
   * /business-signal-sources/changes.
   *
   * @param status Only changes in this state. Omit for all.
   */
  public async listChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<BusinessSignalSourceChange[]> {
    const response = await this.transport.send<{
      changes: BusinessSignalSourceChange[];
    }>({
      method: "GET",
      path:
        status === undefined
          ? "/business-signal-sources/changes"
          : `/business-signal-sources/changes?status=${encodeURIComponent(status)}`,
    });

    return response.body.changes;
  }

  /**
   * Approves and applies a business signal source change. Maps to POST
   * /business-signal-sources/changes/{id}/approve. The caller must not be the
   * proposer and must have a registered step up key. Make
   * `stepUpAuthorization` with `signPolicyChangeStepUp()`, the change id
   * as `pendingPolicyChangeId`, and action "approve".
   */
  public async approveChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<BusinessSignalSourceChange> {
    const response = await this.transport.send<BusinessSignalSourceChange>({
      method: "POST",
      path: `/business-signal-sources/changes/${encodeURIComponent(changeId)}/approve`,
      body: { stepUpAuthorization },
    });

    return response.body;
  }

  /**
   * Rejects a business signal source change. Same caller rules as
   * approveChange(); sign with action "reject". A reason is required.
   */
  public async rejectChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<BusinessSignalSourceChange> {
    const response = await this.transport.send<BusinessSignalSourceChange>({
      method: "POST",
      path: `/business-signal-sources/changes/${encodeURIComponent(changeId)}/reject`,
      body: { rejectionReason, stepUpAuthorization },
    });

    return response.body;
  }
}
