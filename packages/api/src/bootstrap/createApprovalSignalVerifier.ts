import { ApprovalSignalVerifier } from "@parmana/approval";
import type { ApprovalVerifier } from "@parmana/approval";
import type { SignalStateVerifier } from "@parmana/policy";

import { createApprovalVerifier } from "./createApprovalVerifier.js";

/**
 * Creates the production verifier for every policy's approvalSignals
 * (G-65): for any action, a signal the policy declares as approval
 * backed is true only with a signed Approval Artifact from a trusted
 * approver (TRUSTED_APPROVAL_ISSUERS, createApprovalIssuerRegistry.ts)
 * for the resource and value the policy points to.
 */
export function createApprovalSignalVerifier(
  approvalVerifier: ApprovalVerifier = createApprovalVerifier(),
): SignalStateVerifier {
  return new ApprovalSignalVerifier(approvalVerifier);
}
