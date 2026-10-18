import { createPublicKey } from "node:crypto";

import type {
  ApprovalIssuerRegistry,
  ResolvedApprovalIssuer,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import type { ApprovalIssuerRepository } from "@parmana/shared";

import { approvalIssuerRepository } from "../repositories.js";

import { createCodeApprovalIssuerRegistry } from "./codeApprovalIssuers.js";

export {
  buildApprovalIssuerRegistry,
  createCodeApprovalIssuerRegistry,
  type ConfiguredApprovalIssuer,
} from "./codeApprovalIssuers.js";

/**
 * Creates the ApprovalIssuerRegistry used by the ApprovalVerifier every
 * approval check shares (createApprovalVerifier.ts): the list in code,
 * then the approvers added through maker checker.
 */
export function createApprovalIssuerRegistry(
  repository: ApprovalIssuerRepository = approvalIssuerRepository,
): ApprovalIssuerRegistry {
  return new GovernedApprovalIssuerRegistry(
    createCodeApprovalIssuerRegistry(),
    repository,
  );
}

/**
 * The approvers in code, then those in approval_issuers. A key in code
 * wins: a proposal to add a key already listed in code is refused, so
 * the two never disagree. The table is read on every approval, with no
 * cache, so a revocation applies to the next request.
 *
 * Fails closed: a database error, or a stored key that is not a valid
 * Ed25519 public key, makes the issuer unknown, so the approval is
 * refused. Logged as approval_issuer_lookup_failed.
 */
export class GovernedApprovalIssuerRegistry implements ApprovalIssuerRegistry {
  constructor(
    private readonly code: StaticApprovalIssuerRegistry,
    private readonly repository: ApprovalIssuerRepository,
  ) {}

  isInCode(approverId: string, keyId: string): boolean {
    return this.code.resolve(approverId, keyId) !== undefined;
  }

  async resolve(
    approverId: string,
    keyId: string,
  ): Promise<ResolvedApprovalIssuer | undefined> {
    const inCode = this.code.resolve(approverId, keyId);

    if (inCode !== undefined) {
      return inCode;
    }

    try {
      const record = await this.repository.findIssuer(approverId, keyId);

      if (record === null) {
        return undefined;
      }

      const publicKey = createPublicKey(record.publicKeyPem);

      if (publicKey.asymmetricKeyType !== "ed25519") {
        throw new Error(
          `the stored key is ${publicKey.asymmetricKeyType}, not Ed25519`,
        );
      }

      return { publicKey, revoked: record.revoked };
    } catch (error) {
      console.error({
        event: "approval_issuer_lookup_failed",
        approverId,
        keyId,
        error: error instanceof Error ? error.message : String(error),
      });

      return undefined;
    }
  }
}
