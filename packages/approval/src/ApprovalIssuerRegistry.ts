import type { KeyObject } from "node:crypto";

/**
 * One registered Approval Artifact issuer key.
 *
 * revoked resolves Phase 3A's Open Question #4 (revocation store
 * design): rather than a separate, per-approvalId revocation table,
 * revocation is modeled at the issuer-key level -- a small, static,
 * server-side trust list, structurally identical to
 * createConnectorAuthenticator.ts's trusted-connector-identity list.
 * Revoking one compromised or offboarded approver's key instantly
 * invalidates every artifact they ever signed, a coarser but simpler
 * and operationally real guarantee than tracking individual
 * approvalIds. Per-artifact revocation remains a possible future
 * refinement (see the Phase 3C approval artifact record, in git history,
 * Remaining Limitations) -- not implemented here.
 */
export interface TrustedApprovalIssuer {
  readonly approverId: string;
  readonly keyId: string;
  readonly publicKey: KeyObject;
  readonly revoked: boolean;
}

/**
 * Resolution result: the issuer/key pair was found in the trust
 * registry (whether or not it is currently revoked). undefined means
 * the (approverId, keyId) pair is not registered at all -- an
 * "unknown issuer," distinct from a "known but revoked" one, though
 * both fail verification.
 */
export interface ResolvedApprovalIssuer {
  readonly publicKey: KeyObject;
  readonly revoked: boolean;
}

/**
 * Trust boundary for Approval Artifact issuers. Verifies WHICH key
 * signed an artifact is a registered, trusted one -- never trusts
 * caller identity, and never resolves Parmana's own runtime key
 * (FileKeyProvider's DEFAULT_KEY_ID) as a valid issuer, since that
 * would let Parmana certify its own caller's claim rather than an
 * independent authority's.
 */
export interface ApprovalIssuerRegistry {
  /**
   * May answer asynchronously, as a registry backed by a database
   * does. Must answer undefined, never throw, when it cannot tell: an
   * issuer it cannot confirm is unknown, and the approval is refused.
   */
  resolve(
    approverId: string,
    keyId: string,
  ):
    | ResolvedApprovalIssuer
    | undefined
    | Promise<ResolvedApprovalIssuer | undefined>;
}

/**
 * A small, explicit, server-side list of trusted issuers -- the same
 * shape of trust list createConnectorAuthenticator.ts already uses
 * for trusted connector identities, applied here to trusted approval
 * issuers instead. Issuer key provisioning and rotation (how an
 * approver's key gets into this list in the first place) is
 * deliberately out of scope, per Phase 3A §17 Open Question #1 --
 * this class only verifies against whatever list it is constructed
 * with.
 */
export class StaticApprovalIssuerRegistry implements ApprovalIssuerRegistry {
  private readonly issuers = new Map<string, TrustedApprovalIssuer>();

  constructor(issuers: readonly TrustedApprovalIssuer[]) {
    for (const issuer of issuers) {
      this.issuers.set(
        StaticApprovalIssuerRegistry.key(issuer.approverId, issuer.keyId),
        issuer,
      );
    }
  }

  resolve(
    approverId: string,
    keyId: string,
  ): ResolvedApprovalIssuer | undefined {
    const issuer = this.issuers.get(
      StaticApprovalIssuerRegistry.key(approverId, keyId),
    );

    if (issuer === undefined) {
      return undefined;
    }

    return { publicKey: issuer.publicKey, revoked: issuer.revoked };
  }

  /**
   * Every registered issuer, revoked ones included.
   */
  list(): readonly TrustedApprovalIssuer[] {
    return [...this.issuers.values()];
  }

  private static key(approverId: string, keyId: string): string {
    // JSON, not "approverId:keyId": ids may contain ":", and
    // ("a:b", "c") and ("a", "b:c") must not share a key.
    return JSON.stringify([approverId, keyId]);
  }
}
