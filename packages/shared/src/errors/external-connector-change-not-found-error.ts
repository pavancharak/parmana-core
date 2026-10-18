import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when an external connector change lookup or resolution is
 * given an id that does not exist.
 */
export class ExternalConnectorChangeNotFoundError extends ParmanaError {
  constructor(changeId: string) {
    super(
      "EXTERNAL_CONNECTOR_CHANGE_NOT_FOUND",
      `External connector change '${changeId}' not found.`,
      404,
    );
  }
}
