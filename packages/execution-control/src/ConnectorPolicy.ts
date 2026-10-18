import type {
  ConnectorAuthenticator,
  ConnectorPolicy,
  GatewayExecutionRequest,
  SecureConnector,
} from "./types.js";
import { InMemoryGatewaySessionStore } from "./GatewaySessionStore.js";

export class DefaultConnectorPolicy implements ConnectorPolicy {
  constructor(
    private readonly authenticator: ConnectorAuthenticator,
    private readonly sessions: InMemoryGatewaySessionStore,
  ) {}

  async assertAllowed(
    request: GatewayExecutionRequest,
    connector: SecureConnector,
    authentication: unknown,
  ): Promise<void> {
    if (
      !this.authenticator.authenticateGateway(
        request.gatewayIdentity,
        authentication,
      )
    ) {
      throw new Error("Connector rejected unauthenticated Gateway.");
    }
    if (!this.authenticator.authenticateConnector(connector.identity)) {
      throw new Error("Connector identity is not trusted.");
    }
    if (
      !request.verifiedTransaction.authorizationVerified ||
      !request.verifiedTransaction.executableContentVerified ||
      !request.verifiedTransaction.replayCheckPassed
    ) {
      throw new Error("Connector requires a verified transaction.");
    }
    if (!connector.capabilities.includes(request.executableContent.action)) {
      throw new Error("Connector capability does not allow this action.");
    }
    //
    // Defense-in-depth, not a re-verification of the signature itself
    // (verifiedTransaction.authorizationVerified above already trusts
    // that ExecutionGateway did that): when the signed authorization
    // carries a grantedCapability (the capability isCapabilityAllowed
    // confirmed for the caller at the API edge), it must name the same
    // action actually being executed. Absent grantedCapability means
    // no caller-capability check ran for this authorization (caller-
    // auth disabled) -- not "any action is granted" -- so this check
    // is skipped, not failed open, in that case.
    //
    if (
      request.authorization.payload.grantedCapability !== undefined &&
      request.authorization.payload.grantedCapability !==
        request.executableContent.action
    ) {
      throw new Error(
        "Connector requires the executed action to match the authorization's granted capability.",
      );
    }
    if (!this.sessions.consume(request, connector.connectorId)) {
      throw new Error(
        "Connector rejected invalid, expired, modified, or reused Gateway session.",
      );
    }
  }
}
