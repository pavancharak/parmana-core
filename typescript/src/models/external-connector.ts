/**
 * External connectors: your own HTTPS endpoint registered for a
 * capability through maker checker, with no Parmana code change. Parmana
 * releases an approved request to it as a signed release, which the
 * endpoint checks with verifyParmanaRelease().
 */

import type { PendingPolicyChangeStatus } from "./policy-change.js";

/**
 * A capability registered to an HTTPS endpoint, active or revoked.
 */
export interface ExternalConnector {
  /**
   * The changeId of the approved register change that created it.
   */
  readonly registrationId: string;
  readonly capability: string;
  readonly endpointUrl: string;

  /**
   * The policy that governs the capability. A request must declare the
   * version approved through policy governance.
   */
  readonly policy: string;

  /**
   * The intent parameters Parmana forwards to the endpoint.
   */
  readonly allowedParameters: readonly string[];
  readonly timeoutMs: number;

  /**
   * At most one active registration per capability.
   */
  readonly status: "active" | "revoked";
  readonly registeredAt: string;
  readonly revokedByChangeId?: string;
  readonly revokedAt?: string;
}

/**
 * A proposal to register or revoke an external connector, and its
 * resolution.
 */
export interface ExternalConnectorChange {
  /**
   * Sign the step up authorization for approve or reject with this id as
   * `pendingPolicyChangeId`.
   */
  readonly changeId: string;
  readonly action: "register" | "revoke";
  readonly capability: string;
  readonly endpointUrl?: string;
  readonly policy?: string;
  readonly allowedParameters?: readonly string[];
  readonly timeoutMs?: number;
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: string;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  readonly rejectionReason?: string;
}

/**
 * What proposeExternalConnectorChange() sends.
 */
export type ProposeExternalConnectorChangeInput =
  | {
      readonly action: "register";
      /**
       * namespace:action, outside the built in namespaces (paytm,
       * hubspot, github, slack, test).
       */
      readonly capability: string;
      /**
       * https, a public host name, no user name, password or fragment.
       */
      readonly endpointUrl: string;
      readonly policy: string;
      /**
       * May be empty.
       */
      readonly allowedParameters: readonly string[];
      /**
       * 1000 to 30000. Defaults to 10000.
       */
      readonly timeoutMs?: number;
      readonly reason: string;
    }
  | {
      readonly action: "revoke";
      readonly capability: string;
      readonly reason: string;
    };
