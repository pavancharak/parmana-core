import { randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";

import type {
  ExecutableContent,
  ExecutionAuthorizationPayload,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { ArtifactSigner } from "./ArtifactSigner.js";
import { ExecutableContentHasher } from "./ExecutableContentHasher.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";
import type { Signer } from "./Signer.js";

type AuthorizationInput = {
  readonly decisionId: string;
  readonly decisionOutcome?: "APPROVED";
  readonly businessTransactionId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly policyContentHash?: string;
  readonly signalsHash?: string;
  readonly submittedBy?: string;
  readonly grantedCapability?: string;
  readonly businessConditions?: ExecutionAuthorizationPayload["businessConditions"];
  readonly authorityGrant?: ExecutionAuthorizationPayload["authorityGrant"];
  readonly executableContent: ExecutableContent;
};

/**
 * Authorization Signer.
 *
 * Produces a SignedExecutionAuthorization for an
 * approved decision. Delegates all cryptography to
 * ArtifactSigner over the CanonicalSerializer, and
 * content hashing to ExecutableContentHasher (the
 * same hasher the execution gateway uses to verify).
 */
export class AuthorizationSigner {
  private readonly signer: ArtifactSigner;
  private readonly contentHasher: ExecutableContentHasher;

  constructor(private readonly crypto: CryptoProvider) {
    this.signer = new ArtifactSigner(crypto);
    this.contentHasher = new ExecutableContentHasher(crypto);
  }

  /**
   * Signs an authorization payload.
   *
   * The caller supplies identity fields; this
   * method supplies nonce, issue time, and
   * expiry, then signs.
   */
  async sign(
    input: AuthorizationInput,
    privateKey: KeyObject,
    keyId: string,
    ttlSeconds: number,
  ): Promise<SignedExecutionAuthorization> {
    const payload = await this.buildPayload(input, ttlSeconds);

    const signature = await this.signer.sign(payload, privateKey);

    return {
      payload,
      signature,
      keyId,
      algorithm: this.crypto.signature.algorithm,
    };
  }

  /**
   * Signs via a Signer (ADR-0009) instead of a raw private KeyObject
   * -- the path that works against a sign-without-release backend
   * (AWS KMS, HSM) as well as LocalFileSigner. Same payload
   * construction as sign() above; only the signing step differs.
   */
  async signWithSigner(
    input: AuthorizationInput,
    keyId: string,
    signer: Signer,
    ttlSeconds: number,
  ): Promise<SignedExecutionAuthorization> {
    const payload = await this.buildPayload(input, ttlSeconds);

    const signature = await this.signer.signWithSigner(payload, keyId, signer);

    return {
      payload,
      signature,
      keyId,
      algorithm: this.crypto.signature.algorithm,
    };
  }

  /**
   * Builds the unsigned authorization payload -- identical for both
   * sign() and signWithSigner(); only how the resulting payload gets
   * signed differs between them.
   */
  private async buildPayload(
    input: AuthorizationInput,
    ttlSeconds: number,
  ): Promise<ExecutionAuthorizationPayload> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(`Invalid authorization TTL: ${ttlSeconds}`);
    }

    const issuedAt = new Date();

    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    const businessTransactionHash = await this.contentHasher.hash(
      input.executableContent,
    );

    return {
      version: 1,

      authorizationId: randomUUID(),

      nonce: randomUUID(),

      decisionId: input.decisionId,

      ...(input.decisionOutcome !== undefined && {
        decisionOutcome: input.decisionOutcome,
      }),

      businessTransactionId: input.businessTransactionId,

      policyName: input.policyName,

      policyVersion: input.policyVersion,

      ...(input.policyContentHash !== undefined && {
        policyContentHash: input.policyContentHash,
      }),

      ...(input.signalsHash !== undefined && {
        signalsHash: input.signalsHash,
      }),

      ...(input.submittedBy !== undefined && {
        submittedBy: input.submittedBy,
      }),

      ...(input.grantedCapability !== undefined && {
        grantedCapability: input.grantedCapability,
      }),

      ...(input.businessConditions !== undefined &&
        input.businessConditions.length > 0 && {
          businessConditions: input.businessConditions,
        }),

      ...(input.authorityGrant !== undefined && {
        authorityGrant: input.authorityGrant,
      }),

      authorizedAt: issuedAt.toISOString(),

      expiresAt: expiresAt.toISOString(),

      businessTransactionHash,
    };
  }
}
