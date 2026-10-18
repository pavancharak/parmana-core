import * as publicApi from "@parmana/execution-gateway";

//
// Architecture guard (Phase 1D): @parmana/execution-gateway's internal
// implementation classes (GatewayConnectorRegistry, the individual
// connector adapters, low-level helpers) must never be re-exported
// from the package's public entry point. ExecutionGateway is meant to
// be the SOLE public execution entry point -- if a downstream package
// could import GatewayConnectorRegistry directly, it could bypass
// ExecutionGateway's own enforcement entirely, the same class of
// structural bypass Tutorial 45 demonstrates at the runtime level.
// This tutorial proves the guarantee holds at the package's own
// export surface, checked directly against the real published API
// object -- not by reading source and trusting nothing changed since.
//
console.log();
console.log("==================================================");
console.log("Tutorial 92 - Public API Boundary");
console.log("==================================================");
console.log();

const internalSymbols = [
  "GatewayConnectorRegistry",
  "GatewayCapabilityConnectorPolicy",
  "SdkConnectorExecutor",
  "CredentialVaultAdapter",
  "GatewayHubSpotAdapter",
  "GatewayHttpAdapter",
  "buildConnectorEvidence",
  "redactSensitiveKeys",
  "sanitizeEndpoint",
] as const;

console.log(
  "Internal implementation symbols -- none should be publicly exported",
);
console.log("--------------------------------------------------");

const leaked: string[] = [];
for (const symbol of internalSymbols) {
  const isExported = Object.prototype.hasOwnProperty.call(publicApi, symbol);
  console.log(`${symbol.padEnd(32)} -> exported: ${isExported}`);
  if (isExported) leaked.push(symbol);
}
console.log();

console.log(
  "Public execution entry point and connector factories -- these SHOULD be exported",
);
console.log("--------------------------------------------------");
console.log(
  `ExecutionGateway                  -> ${typeof publicApi.ExecutionGateway}`,
);
console.log(
  `createGatewayConnectorRegistry     -> ${typeof publicApi.createGatewayConnectorRegistry}`,
);
console.log(
  `createGatewayHubSpotConnector       -> ${typeof publicApi.createGatewayHubSpotConnector}`,
);
console.log();

const allPassed =
  leaked.length === 0 &&
  typeof publicApi.ExecutionGateway === "function" &&
  typeof publicApi.createGatewayConnectorRegistry === "function" &&
  typeof publicApi.createGatewayHubSpotConnector === "function";

if (allPassed) {
  console.log(
    "✓ No internal implementation class is reachable through the public package entry -- ExecutionGateway (and the connector factories, which return stable interfaces) remain the only way in.",
  );
} else {
  console.log(
    `✗ Expected zero internal symbols to be exported${leaked.length > 0 ? `, but found: ${leaked.join(", ")}` : ""}.`,
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 93 - Trust Record Ordering");
