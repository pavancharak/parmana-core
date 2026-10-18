import { RuntimeError } from "./RuntimeError.js";

export class ReceiptGenerationError extends RuntimeError {
  constructor(message: string) {
    super(message, 409, "RECEIPT_GENERATION_FAILED");
  }
}
