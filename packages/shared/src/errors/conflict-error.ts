import { ParmanaError } from "./parmana-error.js";

export class ConflictError extends ParmanaError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}
