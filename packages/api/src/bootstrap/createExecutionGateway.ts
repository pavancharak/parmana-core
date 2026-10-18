import { ExecutionGateway } from "@parmana/execution-gateway";

import {
  FileKeyExpiryStore,
  SignerBootstrap,
  SignerKeyProviderAdapter,
} from "@parmana/crypto";

import {
  GatewayAttestationSigner,
  RandomIdGenerator,
  SystemClock,
} from "@parmana/execution-control";

import type { ExecutionSystem } from "@parmana/execution-system";
import type { PolicyExecutionVerifier } from "@parmana/policy";

import { policyRepository } from "../application.js";
import { authorityGrantRepository } from "../repositories.js";

import { createExecutionControl } from "./createExecutionControl.js";
import { createGatewayIdentity } from "./createGatewayIdentity.js";
import { createGatewayKeyPair } from "./createGatewayKeyPair.js";
import { createGatewayPublicKey } from "./createGatewayPublicKey.js";
import { createNonceStore } from "./createNonceStore.js";
import { createAuthorizationRevocationList } from "./createAuthorizationRevocationList.js";
import { verifierKeyId } from "./verifierKeyId.js";
import { HUBSPOT_DEAL_FETCH_CAPABILITY } from "@parmana/connector-hubspot";
import { createPolicyExecutionVerifier } from "./createPolicyExecutionVerifier.js";
import { createConnectorRoute } from "./createConnectorRoute.js";
import { executionGatewaySignalStateVerifier } from "./executionGatewaySignalStateVerifier.js";

/**
 * Used only when governance is explicitly relaxed (test/development opt-in).
 * Approves every policy's governance check; the policy content hash check
 * still runs.
 */
const ungovernedPolicyVerifier: PolicyExecutionVerifier = {
  verify: async () => undefined,
};

/**
 * Constructs the production Execution Gateway.
 *
 * Wires two additive verification checks beyond the envelope's own
 * signature/expiry/TTL/nonce checks:
 *
 * - keyProvider/keyExpiryStore (Gap 2A): authorizations are verified
 *   against the specific keyId they were signed with (via the same
 *   Signer -- wrapped in SignerKeyProviderAdapter, see that file --
 *   this function's own publicKey below resolves through), not only
 *   the one static gateway public key -- enabling verification against
 *   a rotated or additional key without a restart. keyExpiryStore is
 *   additive on top: a keyId with no key-expiry.json entry is always
 *   valid.
 *
 *   Root-cause fix (2026-09-16): keyProvider used to be an
 *   unconditional `new FileKeyProvider()`, regardless of KEY_PROVIDER
 *   -- EnvelopeVerifier.resolveKey() uses keyProvider (when supplied at
 *   all) for EVERY authorization it verifies, not only tenant-scoped
 *   ones, so under KEY_PROVIDER=aws-kms this resolved every
 *   authorization's verification key from a stale local
 *   default.public.pem while the authorization was actually signed by
 *   the real KMS key -- signatures silently, permanently failed to
 *   verify in production. publicKey and keyProvider now share one
 *   Signer instance, so signing and per-authorization verification are
 *   guaranteed to agree on the same backend.
 * - policyRepository (Gap 1B): reuses application.ts's own
 *   `policyRepository` singleton -- the same FilePolicyRepository
 *   instance (and therefore the same PARMANA_POLICY_DIR) governance
 *   writes through -- so ExecutionGateway can recompute the current
 *   content hash of the policy an authorization was signed under and
 *   refuse execution if it no longer matches.
 * - signalStateVerifier (G-31): wires the shared
 *   executionGatewaySignalStateVerifier late-binding singleton (see its
 *   own doc comment for why this is late-bound rather than constructed
 *   directly here) so the Gateway can independently re-verify, at the
 *   execution boundary, that the runtime signals an authorization was
 *   signed under still match real-world state.
 */
export async function createExecutionGateway(): Promise<ExecutionSystem> {
  const signer = await SignerBootstrap.create();

  const publicKey = await createGatewayPublicKey(signer);

  const keyProvider = new SignerKeyProviderAdapter(signer);

  const keyExpiryStore = new FileKeyExpiryStore();

  const nonceStore = createNonceStore();

  const executionControl = createExecutionControl({}, keyProvider, nonceStore);

  const route = createConnectorRoute();

  const gatewayIdentity = createGatewayIdentity();

  const { privateKey: gatewayPrivateKey } = createGatewayKeyPair();

  const attestationSigner = new GatewayAttestationSigner(
    new SystemClock(),
    new RandomIdGenerator(),
  );

  //
  // Fail-closed policy binding: undefined only in NODE_ENV test or
  // development (see createPolicyExecutionVerifier.ts). Everywhere else
  // the gateway is constructed without allowUnverifiedPolicy, so it
  // requires the repository and the approval verifier, rejects an
  // authorization with no policyContentHash, and requires the approval
  // record's hash to equal the authorization's and the live hash.
  //
  //
  // Governance is skipped only in the explicit opt-in mode (see
  // policyGovernanceRelaxed.ts). Even then the policy content hash stays
  // required: allowUnverifiedPolicy is never set here.
  //
  const policyApprovalVerifier =
    createPolicyExecutionVerifier() ?? ungovernedPolicyVerifier;

  return new ExecutionGateway({
    publicKey,
    keyProvider,
    keyExpiryStore,
    nonceStore,
    policyRepository,
    policyApprovalVerifier,
    signalStateVerifier: executionGatewaySignalStateVerifier,

    // RFC-0023 phase 4: an authorization that rests on an authority
    // grant is released only while that grant is still the active one.
    authorityGrants: authorityGrantRepository,

    // Single-authorization revocation (revoked-authorizations.json).
    authorizationRevocations: createAuthorizationRevocationList(),

    // The verifier key may sign only the read capability its signal checks use.
    verificationOnlyKeys: {
      keyIds: [verifierKeyId()],
      capabilities: [HUBSPOT_DEAL_FETCH_CAPABILITY],
    },

    executionControl: {
      service: executionControl,

      //
      // Mints a fresh, request-bound attestation per call — see
      // ExecutionControlOptions.mintGatewayAuthentication.
      //
      mintGatewayAuthentication: (authorizationId) =>
        attestationSigner.sign(
          gatewayIdentity.gatewayId,
          authorizationId,
          gatewayPrivateKey,
        ),

      route,
    },
  });
}
