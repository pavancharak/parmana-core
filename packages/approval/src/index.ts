/**
 * @parmana/approval
 *
 * Canonical public API.
 */

export {
  ApprovalVerifier,
  type ApprovalVerificationRequest,
  type ApprovalVerificationResult,
} from "./ApprovalVerifier.js";

export {
  StaticApprovalIssuerRegistry,
  type ApprovalIssuerRegistry,
  type TrustedApprovalIssuer,
  type ResolvedApprovalIssuer,
} from "./ApprovalIssuerRegistry.js";

export { evaluateApprovalScope } from "./ApprovalScopeEvaluator.js";

export { isSignedApprovalShape } from "./SignedApprovalGuard.js";
export {
  ApprovalSignalVerifier,
  APPROVAL_SCOPE_FIELD_RESOURCE_ID,
  APPROVAL_SCOPE_FIELD_VALUE,
} from "./ApprovalSignalVerifier.js";
