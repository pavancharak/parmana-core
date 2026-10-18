import { ParmanaError } from "./parmana-error.js";

export class ReceiptGenerationError extends ParmanaError {
  constructor(message: string) {
    super("RECEIPT_GENERATION_FAILED", message, 500);
  }
}
