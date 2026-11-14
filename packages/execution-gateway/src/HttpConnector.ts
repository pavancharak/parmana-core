import { CryptoBootstrap, ExecutableContentHasher } from "@parmana/crypto";

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
 *
 * It also hashes the content it actually sent (wireContentHash), so the
 * dispatched hash reflects the outbound request, not an in-process object.
 */
export class HttpConnector implements Connector {
  private readonly wireHasher: ExecutableContentHasher;

  constructor(private readonly options: ExecutionSystemClientOptions) {
    this.wireHasher = new ExecutableContentHasher(CryptoBootstrap.create());
    Object.freeze(this);
  }

  public async execute(request: ConnectorRequest): Promise<ExecutionResult> {
    const body = JSON.stringify({
      ...request.transaction,
      authorization: request.authorization,
    });

    const response = await fetch(`${this.options.baseUrl}/execute`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        ...this.options.headers,
      },

      body,
    });

    if (!response.ok) {
      throw new Error(`Connector returned HTTP ${response.status}.`);
    }

    //
    // Hash the content as it was sent: the body parsed back, without the
    // authorization. This is evidence of the outbound request itself.
    //
    const sent = JSON.parse(body) as {
      businessTransactionId: string;
      action: string;
      target: string;
      parameters: Record<string, unknown>;
    };

    const wireContentHash = await this.wireHasher.hash({
      businessTransactionId: sent.businessTransactionId,
      action: sent.action,
      target: sent.target,
      parameters: sent.parameters,
    });

    return {
      ...((await response.json()) as ExecutionResult),
      wireContentHash,
    };
  }
}
