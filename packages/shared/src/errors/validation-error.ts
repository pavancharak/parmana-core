import { ParmanaError } from "./parmana-error.js";

export class ValidationError extends ParmanaError {
  constructor(code: string, message: string) {
    super(code, message, 400);
  }
}
