import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown by a connector registry when an authorized action names a
 * capability that no registered connector provides on this deployment, for
 * example because the connector's credentials were never configured (a
 * connector registers only when its settings are present).
 *
 * Thrown before anything is released to a connector, so nothing was
 * executed. It is a deployment configuration problem and not a caller
 * mistake, so it is a 503 with its own code. Previously it surfaced as a
 * plain Error and a bare 500 with no code, which a caller could not tell
 * apart from a real server fault.
 *
 * Lives in @parmana/shared so packages/api's error-handler.ts can recognize
 * it without a new dependency, the same reasoning
 * nonce-already-consumed-error.ts gives.
 */
export class ConnectorNotRegisteredError extends ParmanaError {
  constructor(capability: string) {
    super(
      "CONNECTOR_NOT_REGISTERED",
      `No connector is registered for capability '${capability}' on this deployment. ` +
        "Nothing was executed. The operator must configure the connector.",
      503,
    );
  }
}
