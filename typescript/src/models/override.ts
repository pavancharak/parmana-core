export interface Override {
  readonly overrideId: string;
  readonly businessTransactionId: string;
  readonly approvedBy: string;
  readonly reason: string;
  readonly justification?: string;
  readonly approvedAt: Date;
}
