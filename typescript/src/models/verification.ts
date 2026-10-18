export type VerificationStatus = "VERIFIED" | "FAILED";

export interface Verification {
  readonly verificationId: string;
  readonly businessTransactionId: string;
  readonly status: VerificationStatus;
  readonly message?: string;
  readonly verifiedAt: Date;
  readonly trustRecordHash: string;
}
