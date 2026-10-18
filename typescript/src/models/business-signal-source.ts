/**
 * Business signal sources (RFC-0023): a business system, such as an ERP,
 * an order system or a CRM, registered through maker checker so Parmana
 * can ask it for the facts a policy declares in `signalSources` instead
 * of trusting what the agent proposed.
 */

import type { PendingPolicyChangeStatus } from "./policy-change.js";

/**
 * A business system registered under a name, active or revoked.
 */
export interface BusinessSignalSource {
  /**
   * The changeId of the approved register change that created it.
   */
  readonly registrationId: string;

  /**
   * The name a policy's signalSources uses in `source`.
   */
  readonly name: string;

  /**
   * The HTTPS endpoint Parmana posts each signed query to.
   */
  readonly endpointUrl: string;
  readonly timeoutMs: number;

  /**
   * The Ed25519 public key (SPKI PEM) the source signs its answers with.
   * When present, an answer without a valid signature is refused.
   */
  readonly publicKeyPem?: string;
  readonly keyId?: string;

  /**
   * At most one active registration per name.
   */
  readonly status: "active" | "revoked";
  readonly registeredAt: string;
  readonly revokedByChangeId?: string;
  readonly revokedAt?: string;
}

/**
 * A proposal to register or revoke a business signal source, and its
 * resolution.
 */
export interface BusinessSignalSourceChange {
  /**
   * Sign the step up authorization for approve or reject with this id as
   * `pendingPolicyChangeId`.
   */
  readonly changeId: string;
  readonly action: "register" | "revoke";
  readonly name: string;
  readonly endpointUrl?: string;
  readonly timeoutMs?: number;
  readonly publicKeyPem?: string;
  readonly keyId?: string;
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: string;
  readonly status: PendingPolicyChangeStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  readonly rejectionReason?: string;
}

/**
 * What proposeBusinessSignalSourceChange() sends.
 */
export type ProposeBusinessSignalSourceChangeInput =
  | {
      readonly action: "register";
      /**
       * Lowercase letters, digits and hyphens, at most 63 characters.
       */
      readonly name: string;
      /**
       * https, a public host name, no user name, password or fragment.
       */
      readonly endpointUrl: string;
      /**
       * 1000 to 30000. Defaults to 10000.
       */
      readonly timeoutMs?: number;
      /**
       * Optional, recommended: the Ed25519 public key in PEM the source
       * signs its answers with.
       */
      readonly publicKeyPem?: string;
      /**
       * Optional, only with publicKeyPem.
       */
      readonly keyId?: string;
      readonly reason: string;
    }
  | {
      readonly action: "revoke";
      readonly name: string;
      readonly reason: string;
    };
