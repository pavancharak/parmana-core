import type { ExecutionResult } from "@parmana/shared";

import type { ExecutionSystemClientOptions } from "@parmana/execution-system";

import type { Connector } from "./Connector.js";
import type { ConnectorRequest } from "./ConnectorRequest.js";

/**
 * HTTP Connector.
 *
 * Reference Connector implementation. Sends the
 * Gateway-verified content and authorization to an
 * external HTTP execution endpoint.
 *
 * This is the same HTTP forwarding @parmana/execution-system's
 * HttpExecutionSystem performed, refactored to sit behind the
 * Execution Gateway: it now runs only after the Gateway's full
 * verification sequence has passed, and the wire body it sends
 * is unchanged (businessTransactionId, action, target,
 * parameters, authorization) so existing receiving sides
 * require no changes.
 */
export class HttpConnector implements Connector {
  constructor(private readonly options: ExecutionSystemClientOptions) {
    Object.freeze(this);
  }

  public async execute(request: ConnectorRequest): Promise<ExecutionResult> {
    const response = await fetch(`${this.options.baseUrl}/execute`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        ...this.options.headers,
      },

      body: JSON.stringify({
        ...request.transaction,
        authorization: request.authorization,
      }),
    });

    if (!response.ok) {
      throw new Error(`Connector returned HTTP ${response.status}.`);
    }

    return (await response.json()) as ExecutionResult;
  }
}
