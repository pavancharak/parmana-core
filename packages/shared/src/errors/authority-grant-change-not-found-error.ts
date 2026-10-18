import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when an authority grant change lookup or resolution is given
 * an id that does not exist.
 */
export class AuthorityGrantChangeNotFoundError extends ParmanaError {
  constructor(changeId: string) {
    super(
      "AUTHORITY_GRANT_CHANGE_NOT_FOUND",
      `Authority grant change '${changeId}' not found.`,
      404,
    );
  }
}
