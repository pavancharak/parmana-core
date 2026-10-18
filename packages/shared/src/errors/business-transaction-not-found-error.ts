import { ParmanaError } from "./parmana-error.js";

export class BusinessTransactionNotFoundError extends ParmanaError {
  constructor(businessTransactionId: string) {
    super(
      "BUSINESS_TRANSACTION_NOT_FOUND",
      `Business Transaction '${businessTransactionId}' not found.`,
      404,
    );
  }
}
