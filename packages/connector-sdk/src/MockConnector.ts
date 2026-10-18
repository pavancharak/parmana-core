import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "./ConnectorTypes.js";

export interface MockConnectorScript {
  /** Returns a scripted response for the given request. */
  respond?(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): ConnectorResponse | Promise<ConnectorResponse>;

  /** When set, execution rejects with this error instead of responding. */
  failWith?: Error;
}

export interface MockConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  readonly script?: MockConnectorScript;
}

/**
 * Scripted, in-memory Connector for hermetic tests.
 *
 * Supports capability declarations, scripted responses, and failure
 * injection. Records every request it receives so tests can assert on
 * exactly what a connector was asked to execute.
 */
export class MockConnector implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  private readonly calls: ConnectorRequest[] = [];

  constructor(private readonly options: MockConnectorOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = options.capabilities;
  }

  get invocations(): readonly ConnectorRequest[] {
    return [...this.calls];
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(
        `MockConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    this.calls.push(request);

    if (this.options.script?.failWith !== undefined) {
      throw this.options.script.failWith;
    }
    if (this.options.script?.respond !== undefined) {
      return this.options.script.respond(request, context);
    }
    return { success: true, metadata: {} };
  }
}
