export interface Receipt {
  readonly receiptId: string;
  readonly businessTransactionId: string;
  readonly trustRecordHash: string;
  readonly receiptHash: string;
  readonly issuedAt: Date;
  readonly algorithm: string;
  readonly signature: string;
}
