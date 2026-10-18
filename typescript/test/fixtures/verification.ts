/**
 * Parmana TypeScript SDK
 *
 * Canonical Verification fixture.
 */

import { Verification, VerificationStatus } from "@parmana/shared";

/**
 * Canonical Verification fixture.
 */
export const verification: Verification = {
  verificationId: "verification-001",

  businessTransactionId: "txn-000001",

  status: VerificationStatus.VERIFIED,

  message: "Execution Trust Record verified successfully.",

  verifiedAt: new Date("2026-01-01T00:00:02Z"),

  trustRecordHash: "sha256:trust-record-hash",
};
