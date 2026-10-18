import { ParmanaError } from "./parmana-error.js";

export class OverrideNotAllowedError extends ParmanaError {
  constructor(message: string) {
    super("OVERRIDE_NOT_ALLOWED", message, 409);
  }
}
