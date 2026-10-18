/**
 * Parmana SDK
 *
 * External Connector API.
 *
 * Connect your own system with no Parmana code change: list the
 * registrations, propose registering a capability to your HTTPS endpoint
 * or revoking it, and approve or reject a proposal with a signed step up
 * authorization. Every call needs an API key that belongs to a verified
 * human.
 */

import type { Transport } from "../config/Transport.js";

import type {
  ExternalConnector,
  ExternalConnectorChange,
  ProposeExternalConnectorChangeInput,
} from "../models/external-connector.js";
import type {
  PendingPolicyChangeStatus,
  PolicyChangeStepUpAuthorization,
} from "../models/policy-change.js";

export class ExternalConnectorApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Every registration, active and revoked. Maps to GET
   * /external-connectors.
   */
  public async list(): Promise<ExternalConnector[]> {
    const response = await this.transport.send<{
      connectors: ExternalConnector[];
    }>({
      method: "GET",
      path: "/external-connectors",
    });

    return response.body.connectors;
  }

  /**
   * Proposes registering or revoking an external connector. Nothing
   * changes until a different person approves it. Maps to POST
   * /external-connectors/changes.
   */
  public async proposeChange(
    input: ProposeExternalConnectorChangeInput,
  ): Promise<ExternalConnectorChange> {
    const response = await this.transport.send<ExternalConnectorChange>({
      method: "POST",
      path: "/external-connectors/changes",
      body: input,
    });

    return response.body;
  }

  /**
   * Lists external connector changes, newest first. Maps to GET
   * /external-connectors/changes.
   *
   * @param status Only changes in this state. Omit for all.
   */
  public async listChanges(
    status?: PendingPolicyChangeStatus,
  ): Promise<ExternalConnectorChange[]> {
    const response = await this.transport.send<{
      changes: ExternalConnectorChange[];
    }>({
      method: "GET",
      path:
        status === undefined
          ? "/external-connectors/changes"
          : `/external-connectors/changes?status=${encodeURIComponent(status)}`,
    });

    return response.body.changes;
  }

  /**
   * Approves and applies an external connector change. Maps to POST
   * /external-connectors/changes/{id}/approve. The caller must not be the
   * proposer and must have a registered step up key. Make
   * `stepUpAuthorization` with `signPolicyChangeStepUp()`, the change id
   * as `pendingPolicyChangeId`, and action "approve".
   */
  public async approveChange(
    changeId: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ExternalConnectorChange> {
    const response = await this.transport.send<ExternalConnectorChange>({
      method: "POST",
      path: `/external-connectors/changes/${encodeURIComponent(changeId)}/approve`,
      body: { stepUpAuthorization },
    });

    return response.body;
  }

  /**
   * Rejects an external connector change. Same caller rules as
   * approveChange(); sign with action "reject". A reason is required.
   */
  public async rejectChange(
    changeId: string,
    rejectionReason: string,
    stepUpAuthorization: PolicyChangeStepUpAuthorization,
  ): Promise<ExternalConnectorChange> {
    const response = await this.transport.send<ExternalConnectorChange>({
      method: "POST",
      path: `/external-connectors/changes/${encodeURIComponent(changeId)}/reject`,
      body: { rejectionReason, stepUpAuthorization },
    });

    return response.body;
  }
}
