import type { ExecutionResult } from "@parmana/shared";

import type { ConnectorRequest } from "./ConnectorRequest.js";

/**
 * Canonical Connector.
 *
 * A Connector is an enterprise execution system
 * (SAP, Oracle, Salesforce, a bank's payment rail,
 * etc.) integrated behind the Execution Gateway. It
 * never receives a request directly from the
 * runtime — only from the Gateway, after every
 * verification check has passed.
 */
export interface Connector {
  execute(request: ConnectorRequest): Promise<ExecutionResult>;
}
