import { randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";

import type {
  ApprovalPayload,
  ApprovalScope,
  SignedApproval,
} from "@parmana/shared";

import { ArtifactSigner } from "./ArtifactSigner.js";
import { SHA256HashProvider } from "./providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "./providers/signature/Ed25519SignatureProvider.js";
import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Approval Artifact keys belong to people (a manager, a finance lead),
 * never to Parmana's runtime, so they are always Ed25519, whatever this
 * server's own PRIMARY_SIGNATURE_PROVIDER is. The same reasoning as
 * PolicyChangeStepUpAuthorizationCrypto.ts: the approver signs on their
 * own machine and must not depend on the server's configuration, and
 * the server must verify with the same algorithm the approver used.
 *
 * Pass this to ApprovalVerifier as its crypto provider.
 */
export const APPROVAL_ARTIFACT_CRYPTO_PROVIDER: CryptoProvider = {
  hash: new SHA256HashProvider(),
  signature: new Ed25519SignatureProvider(),
};

export interface ApprovalArtifactSignInput {
  readonly approverId: string;
  readonly keyId: string;
  readonly capability: string;
  readonly resourceId: string;
  readonly scope: ApprovalScope;
  readonly ttlSeconds: number;
}

/**
 * Signs an Approval Artifact (SignedApproval). Run by the approver on
 * their own machine against their own private key, for example through
 * scripts/sign-approval.ts; never runs server side. The caller supplies
 * what is approved; this method supplies the id, nonce and timestamps.
 */
export class ApprovalArtifactSigner {
  private readonly signer = new ArtifactSigner(
    APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  );

  async sign(
    input: ApprovalArtifactSignInput,
    privateKey: KeyObject,
    now: Date = new Date(),
  ): Promise<SignedApproval> {
    if (!Number.isFinite(input.ttlSeconds) || input.ttlSeconds <= 0) {
      throw new Error(`Invalid approval TTL: ${input.ttlSeconds}`);
    }

    const payload: ApprovalPayload = {
      version: 1,
      approvalId: randomUUID(),
      issuer: { approverId: input.approverId, keyId: input.keyId },
      issuedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + input.ttlSeconds * 1000,
      ).toISOString(),
      capability: input.capability,
      resourceId: input.resourceId,
      scope: input.scope,
      nonce: randomUUID(),
    };

    const value = await this.signer.sign(payload, privateKey);

    return {
      payload,
      signature: {
        algorithm: APPROVAL_ARTIFACT_CRYPTO_PROVIDER.signature.algorithm,
        keyId: input.keyId,
        value,
        signedAt: now,
      },
    };
  }
}
