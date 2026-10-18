import type { ExecutionResult } from "@parmana/shared";

import type { ConnectorRegistry } from "./ConnectorRegistry.js";
import type {
  ExecutionAuditSink,
  ExecutionChannel,
  GatewayExecutionRequest,
  GatewaySessionAuthority,
} from "./types.js";

export interface DefaultExecutionChannelOptions {
  readonly registry: ConnectorRegistry;
  readonly sessions: GatewaySessionAuthority;
  readonly audit: ExecutionAuditSink;
  /** Workload-identity presentation accepted only from the Gateway. */
  readonly gatewayIdentity: unknown;
}

export class DefaultExecutionChannel implements ExecutionChannel {
  constructor(private readonly options: DefaultExecutionChannelOptions) {}

  async release(
    request: GatewayExecutionRequest,
    gatewayIdentity: unknown,
  ): Promise<ExecutionResult> {
    if (gatewayIdentity !== this.options.gatewayIdentity) {
      throw new Error("Execution Channel rejected unauthenticated caller.");
    }
    if (!request.verification.valid) {
      throw new Error("Execution Channel requires a verified Gateway request.");
    }
    const connector = this.options.registry.get(request.connectorId);
    if (!connector)
      throw new Error(`Unknown connector: ${request.connectorId}.`);

    const session = await this.options.sessions.open(request);
    await this.options.audit.record({
      type: "session.opened",
      occurredAt: new Date().toISOString(),
      executionId: request.executionId,
      connectorId: request.connectorId,
      authorizationId: request.authorization.payload.authorizationId,
      sessionId: session.sessionId,
    });
    return connector.invoke(Object.freeze({ ...request, session }));
  }
}
