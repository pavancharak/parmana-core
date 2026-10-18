import { ParmanaError } from "./parmana-error.js";

export class PolicyNotFoundError extends ParmanaError {
  constructor(name: string, version: string) {
    super(
      "POLICY_NOT_FOUND",
      `Policy '${name}' version '${version}' not found.`,
      404,
    );
  }
}
