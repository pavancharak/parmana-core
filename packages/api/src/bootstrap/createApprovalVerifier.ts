import { ApprovalVerifier } from "@parmana/approval";
import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";

import { createApprovalIssuerRegistry } from "./createApprovalIssuerRegistry.js";
import { createApprovalNonceStore } from "./createApprovalNonceStore.js";

/**
 * The ApprovalVerifier every capability scoped SignalStateVerifier
 * shares (hubspot:deal-update amount changes, paytm:refund manager
 * approvals). One trusted issuer list and one nonce store, so an
 * approval is single use across all of them.
 *
 * Verifies with APPROVAL_ARTIFACT_CRYPTO_PROVIDER (Ed25519), not
 * CryptoBootstrap.create(): approvers sign with their own Ed25519 keys
 * (scripts/sign-approval.ts), whatever this server's own
 * PRIMARY_SIGNATURE_PROVIDER is.
 */
export function createApprovalVerifier(): ApprovalVerifier {
  return new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: createApprovalIssuerRegistry(),
    nonceStore: createApprovalNonceStore(),
  });
}
