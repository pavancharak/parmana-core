import {
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
} from "@parmana/execution-control";
import { MemoryExternalConnectorRepository } from "@parmana/storage";

//
// Tutorials 57-59 show the credential-isolation and secure-connector
// session mechanics generically, with one hand-built "sap" connector.
// This tutorial shows the layer above that: GatewayConnectorRegistry,
// the real production registry every capability (test:fixture-execute
// here, the only built in connector left in core) actually resolves through --
// the exact class createConnectorRegistry.ts wires up, exercised the
// same way its own unit test suite does.
//
process.env.NODE_ENV = "test";
// Test-only: this example runs with no maker-checker records for its policy.
process.env.PARMANA_ALLOW_UNGOVERNED_POLICY = "true";

const { createConnectorRegistry } =
  await import("../../../packages/api/src/bootstrap/createConnectorRegistry.js");
const { createConnectorAuthenticator } =
  await import("../../../packages/api/src/bootstrap/createConnectorAuthenticator.js");

function buildRegistry() {
  const authenticator = createConnectorAuthenticator();
  const sessions = new InMemoryGatewaySessionStore(Object.freeze({}));
  const audit = new MemoryExecutionAuditSink();
  return createConnectorRegistry(
    authenticator,
    sessions,
    audit,
    Object.freeze({ token: "test" }),
    // No external connector is registered here (ADR-0013), and none is
    // read from real storage.
    new MemoryExternalConnectorRepository(),
  );
}

console.log();
console.log("==================================================");
console.log("Tutorial 81 - Connector Execution Gateway");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1: NODE_ENV=test -- the test-fixture capability resolves",
);
console.log("--------------------------------------------------");

const registry1 = buildRegistry();
const testFixtureConnector = (
  await registry1.resolveCapability("test:fixture-execute")
).connectorId;
console.log(`test:fixture-execute   -> connector "${testFixtureConnector}"`);
console.log();

console.log(
  "Scenario 2: Outside test mode -- the test-fixture connector is not registered and fails closed",
);
console.log("--------------------------------------------------");

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";

const registry2 = buildRegistry();

// test-fixture (a NODE_ENV=test-only MockConnector) is absent outside test
// mode, and the registry fails closed for it on its own terms.
let testFixtureError: string | undefined;
try {
  await registry2.resolveCapability("test:fixture-execute");
} catch (error) {
  testFixtureError = error instanceof Error ? error.message : String(error);
}
console.log(`test:fixture-execute   -> throws: ${testFixtureError}`);
console.log();

process.env.NODE_ENV = previousNodeEnv;

const allPassed =
  testFixtureConnector === "test-fixture" &&
  testFixtureError?.includes("test:fixture-execute") === true;

if (allPassed) {
  console.log(
    "✓ The test-fixture capability resolves to its connector in test mode, and fails closed outside it.",
  );
} else {
  console.log(
    "✗ Expected the test-fixture capability to resolve in test mode and fail closed outside it.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 83 - Capability Policy Binding");
