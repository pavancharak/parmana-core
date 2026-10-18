import type { KeyObject } from "node:crypto";
import { randomUUID } from "node:crypto";

import {
  AuthorizationSigner,
  type CryptoProvider,
  type Signer,
} from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

/**
 * How the fresh authorization is signed: with a raw private key, or
 * through a Signer (ADR-0009). Only a Signer works when the key cannot
 * leave its backend (KEY_PROVIDER=aws-kms), because there is no private
 * key to read; production wiring passes the Signer from
 * SignerBootstrap, so it signs with the same key the gateway verifies.
 */
export type HubSpotCapabilitySigning =
  | { readonly signerPrivateKey: KeyObject; readonly signer?: undefined }
  | { readonly signer: Signer; readonly signerPrivateKey?: undefined };

export type HubSpotCapabilityExecutionOptions = HubSpotCapabilitySigning & {
  readonly gateway: ExecutionSystem;
  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  /**
   * Content hash of the policy the fetch is authorized under. The gateway
   * requires it (policy binding), so the verification fetch cannot run
   * without it.
   */
  readonly policyContentHash?: string;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;
};

export interface HubSpotCapabilityExecutionContent {
  readonly businessTransactionId: string;
  readonly action: string;
  readonly target: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * Signs and executes one HubSpot capability call: fresh authorization,
 * signed with the caller-supplied key or Signer, submitted through the
 * caller-supplied ExecutionSystem (envelope verification, nonce
 * consumption, connector dispatch -- unmodified, the same gateway every
 * other execution goes through).
 *
 * Both HubSpotDealUpdateService (authorizing the deal update it is
 * about to place) and HubSpotSignalStateVerifier (independently
 * re-fetching deal state before policy evaluation) call this, so the
 * sign-then-execute shape exists in exactly one place.
 */
export async function executeHubSpotCapability(
  options: HubSpotCapabilityExecutionOptions,
  content: HubSpotCapabilityExecutionContent,
): Promise<ExecutionResult> {
  const authorizationSigner = new AuthorizationSigner(options.crypto);

  const executableContent: ExecutableContent = Object.freeze({
    ...content,
    parameters: Object.freeze({ ...content.parameters }),
  });

  const input = {
    decisionId: randomUUID(),
    // This helper authorizes its own execution with the caller's signing key;
    // there is no runtime decision behind it. See CLAIMS 2.57 and docs/VERIFICATION-GAPS.md G-111.
    decisionOutcome: "APPROVED" as const,
    businessTransactionId: content.businessTransactionId,
    policyName: options.policyName,
    policyVersion: options.policyVersion,
    ...(options.policyContentHash !== undefined && {
      policyContentHash: options.policyContentHash,
    }),
    executableContent,
  };
  const ttlSeconds = options.authorizationTtlSeconds ?? 60;

  const authorization =
    options.signer !== undefined
      ? await authorizationSigner.signWithSigner(
          input,
          options.signerKeyId,
          options.signer,
          ttlSeconds,
        )
      : await authorizationSigner.sign(
          input,
          options.signerPrivateKey,
          options.signerKeyId,
          ttlSeconds,
        );

  return options.gateway.execute({
    businessTransactionId: content.businessTransactionId,
    action: content.action,
    target: content.target,
    parameters: content.parameters,
    authorization,
  });
}

/** Unwraps the connector-reported metadata a capability response carries. */
export function hubSpotConnectorResponseMetadata(
  result: ExecutionResult,
): Record<string, unknown> {
  const connector = result.metadata?.connector as
    { responseSummary?: { metadata?: Record<string, unknown> } } | undefined;
  return connector?.responseSummary?.metadata ?? {};
}
