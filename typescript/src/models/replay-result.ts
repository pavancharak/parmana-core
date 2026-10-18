export interface ReplayResult {
  readonly businessTransactionId: string;
  readonly trustRecordHash: string;
  readonly verified: boolean;
}
