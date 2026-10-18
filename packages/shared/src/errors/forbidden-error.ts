import { ParmanaError } from "./parmana-error.js";

export class ForbiddenError extends ParmanaError {
  constructor(message = "Access denied.") {
    super("FORBIDDEN", message, 403);
  }
}
