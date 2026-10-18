import { ParmanaError } from "./parmana-error.js";

export class UnauthorizedError extends ParmanaError {
  constructor(message = "Authentication required.") {
    super("UNAUTHORIZED", message, 401);
  }
}
