import {
  AuthorizationSigner,
  CryptoBootstrap,
  SignerBootstrap,
} from "@parmana/crypto";

import type {
  ExecutableContent,
  ExecutionAuthorizationPayload,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import {
  FileTenantKeyResolver,
  type TenantKeyResolver,
} from "./TenantKeyResolver.js";

/**
 * Runtime Authorization Signer.
 *
 * Signs Execution Authorizations via Signer (ADR-0009) -- LocalFileSigner
 * or KmsSigner depending on KEY_PROVIDER, resolved once through
 * SignerBootstrap, the same composition root every other signed
 * artifact in this codebase now uses. The keyId used for a given
 * authorization is resolved per-tenant by TenantKeyResolver, falling
 * back to the shared default key ("default") when no tenant-specific
 * key has been provisioned -- see TenantKeyResolver's own doc comment.
 */
export class RuntimeAuthorizationSigner {
  private readonly crypto = CryptoBootstrap.create();

  private readonly signerPromise = SignerBootstrap.create();

  private readonly authorizationSigner = new AuthorizationSigner(this.crypto);

  private readonly keyResolverPromise: Promise<TenantKeyResolver>;

  constructor(keyResolver?: TenantKeyResolver) {
    this.keyResolverPromise = keyResolver
      ? Promise.resolve(keyResolver)
      : this.signerPromise.then((signer) => new FileTenantKeyResolver(signer));
  }

  /**
   * Signs an authorization payload.
   */
  async sign(
    input: {
      readonly decisionId: string;
      readonly decisionOutcome?: "APPROVED";
      readonly businessTransactionId: string;
      readonly policyName: string;
      readonly policyVersion: string;
      readonly policyContentHash?: string;
      readonly signalsHash?: string;
      readonly submittedBy?: string;
      readonly grantedCapability?: string;
      readonly tenantId?: string;
      readonly businessConditions?: ExecutionAuthorizationPayload["businessConditions"];
      readonly authorityGrant?: ExecutionAuthorizationPayload["authorityGrant"];
      readonly executableContent: ExecutableContent;
    },
    ttlSeconds: number,
  ): Promise<SignedExecutionAuthorization> {
    const [keyResolver, signer] = await Promise.all([
      this.keyResolverPromise,
      this.signerPromise,
    ]);

    const keyId = await keyResolver.resolveKeyId(input.tenantId);

    return this.authorizationSigner.signWithSigner(
      input,
      keyId,
      signer,
      ttlSeconds,
    );
  }
}
