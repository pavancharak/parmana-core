import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when a business signal source change lookup or resolution is
 * given an id that does not exist.
 */
export class BusinessSignalSourceChangeNotFoundError extends ParmanaError {
  constructor(changeId: string) {
    super(
      "BUSINESS_SIGNAL_SOURCE_CHANGE_NOT_FOUND",
      `Business signal source change '${changeId}' not found.`,
      404,
    );
  }
}
