import {
  CryptoBootstrap,
  TrustRecordHasher,
  SignerBootstrap,
  type Signer,
} from "@parmana/crypto";
import { HubSpotSignalStateVerifier } from "@parmana/connector-hubspot";
import type { PolicyRepository, SignalStateVerifier } from "@parmana/policy";
import type { ExecutionSystem } from "@parmana/execution-system";

import { loadConfig } from "@parmana/shared";

import type { ApprovalVerifier } from "@parmana/approval";

import { createApprovalVerifier } from "./createApprovalVerifier.js";
import { verifierKeyId } from "./verifierKeyId.js";

/**
 * Resolves the Signer on first use, not at construction, so this stays
 * a plain synchronous factory and nothing calls a key backend while
 * the module loads. A failed resolution is not cached: the next
 * verification tries again, and until then each one fails closed.
 */
export function lazySignerBootstrap(
  create: () => Promise<Signer> = () => SignerBootstrap.create(),
): () => Promise<Signer> {
  let pending: Promise<Signer> | undefined;

  return () => {
    pending ??= create().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

/**
 * Creates the production Signal/State Verifier for the
 * hubspot-deal-update capability (G-24 residual closure, RFC-0022;
 * TD-23 preAuthorizedForAmountChange closure, Phase 3C).
 *
 * Signs its own verification fetches through the Signer SignerBootstrap
 * selects from KEY_PROVIDER (ADR-0009), the same composition root
 * RuntimeAuthorizationSigner and the gateway use, so the fetch is
 * signed with the key the gateway verifies against. It used to read the
 * local key file directly (new FileKeyProvider()), which under
 * KEY_PROVIDER=aws-kms signed with a different key than the gateway
 * verified, so every hubspot:deal-update was refused.
 *
 * approvalVerifier is always supplied here (never omitted) -- the
 * production wiring path is where independent verification of
 * preAuthorizedForAmountChange becomes a structural invariant rather
 * than an optional, caller-declared signal; omitting it is only ever
 * done by tests that construct HubSpotSignalStateVerifier directly.
 */
export function createHubSpotSignalStateVerifier(
  executionSystem: ExecutionSystem,
  approvalVerifier: ApprovalVerifier = createApprovalVerifier(),
  resolveSigner: () => Promise<Signer> = lazySignerBootstrap(),
  policies?: PolicyRepository,
): SignalStateVerifier {
  const { ttlSeconds: authorizationTtlSeconds } = loadConfig().authorization;

  const crypto = CryptoBootstrap.create();

  return new HubSpotSignalStateVerifier({
    gateway: executionSystem,
    resolveSigner,
    signerKeyId: verifierKeyId(),
    policyName: "hubspot-deal-update",
    policyVersion: "1.0.0",
    // The fetch is bound to the same policy content the gateway checks it
    // against, so it verifies under the policy's live content hash.
    ...(policies !== undefined && {
      resolvePolicyContentHash: async () =>
        new TrustRecordHasher(crypto).hash(
          await policies.load("hubspot-deal-update", "1.0.0"),
        ),
    }),
    crypto,
    authorizationTtlSeconds,
    approvalVerifier,
  });
}
