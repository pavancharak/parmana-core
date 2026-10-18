import { describe, expect, it } from "vitest";

import * as publicApi from "../../src/index.js";

/**
 * Phase 1D architecture guard: proves the connector-execution
 * implementation classes are internal, not part of the package's public
 * surface. If any of these ever get re-added to src/index.ts (directly or
 * via `export * from "./connector-execution/index.js"`), this test fails
 * — the same signal Task 5/6's "no downstream package imports the
 * implementation classes" guarantee depends on staying true.
 *
 * ExecutionGateway remains the sole public execution entry point;
 * connector-execution's public surface is limited to the
 * createGateway*() factories, which return stable interface types
 * (Connector, ConnectorRegistry) rather than the concrete classes below.
 */
describe("execution-gateway public API boundary", () => {
  const internalSymbols = [
    "GatewayConnectorRegistry",
    "GatewayCapabilityConnectorPolicy",
    "SdkConnectorExecutor",
    "CredentialVaultAdapter",
    "GatewayHubSpotAdapter",
    "GatewayHttpAdapter",
    "GatewayPaytmAdapter",
    "buildConnectorEvidence",
    "redactSensitiveKeys",
    "sanitizeEndpoint",
  ] as const;

  it.each(internalSymbols)(
    "does not export %s from the public package entry",
    (symbol) => {
      expect(Object.prototype.hasOwnProperty.call(publicApi, symbol)).toBe(
        false,
      );
    },
  );

  it("exports ExecutionGateway as the sole public execution entry point", () => {
    expect(publicApi.ExecutionGateway).toBeTypeOf("function");
  });

  it("exports the connector-execution factories, not the classes they construct", () => {
    expect(publicApi.createGatewayConnectorRegistry).toBeTypeOf("function");
    expect(publicApi.createGatewayHubSpotConnector).toBeTypeOf("function");
  });
});
