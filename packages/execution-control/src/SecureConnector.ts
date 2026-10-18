import type { ExecutionResult } from "@parmana/shared";

import type {
  ConnectorExecutor,
  ConnectorIdentity,
  ConnectorPolicy,
  CredentialVault,
  GatewayExecutionRequest,
  SecureConnector,
} from "./types.js";

export interface InMemorySecureConnectorOptions {
  readonly identity: ConnectorIdentity;
  readonly capabilities: readonly string[];
  readonly policy: ConnectorPolicy;
  readonly gatewayAuthentication: unknown;
  readonly credentialVault: CredentialVault;
  readonly executor: ConnectorExecutor;
}

export class InMemorySecureConnector implements SecureConnector {
  readonly connectorId: string;
  readonly capabilities: readonly string[];
  readonly identity: ConnectorIdentity;

  constructor(private readonly options: InMemorySecureConnectorOptions) {
    this.connectorId = options.identity.connectorId;
    this.identity = Object.freeze({
      ...options.identity,
      authenticationMetadata: Object.freeze({
        ...options.identity.authenticationMetadata,
      }),
    });
    this.capabilities = Object.freeze([...options.capabilities]);
  }

  async execute(request: GatewayExecutionRequest): Promise<ExecutionResult> {
    await this.options.policy.assertAllowed(
      request,
      this,
      this.options.gatewayAuthentication,
    );
    const credential = await this.options.credentialVault.getCredential(
      this.connectorId,
    );
    return this.options.executor.execute(
      request.executableContent,
      credential,
      {
        authorization: request.authorization,
        approvals: request.approvals ?? [],
      },
    );
  }
}
