import {
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
} from "@parmana/execution-control";
import { MemoryExternalConnectorRepository } from "@parmana/storage";

//
// Tutorials 57-59 show the credential-isolation and secure-connector
// session mechanics generically, with one hand-built "sap" connector.
// This tutorial shows the layer above that: GatewayConnectorRegistry,
// the real production registry every capability (hubspot:deal-update,
// hubspot:deal-fetch, test:fixture-execute) actually resolves through --
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
  "Scenario 1: NODE_ENV=test -- every connector's capabilities resolve",
);
console.log("--------------------------------------------------");

const registry1 = buildRegistry();
console.log(
  `hubspot:deal-update    -> connector "${(await registry1.resolveCapability("hubspot:deal-update")).connectorId}"`,
);
console.log(
  `hubspot:deal-fetch     -> connector "${(await registry1.resolveCapability("hubspot:deal-fetch")).connectorId}"`,
);
console.log(
  `test:fixture-execute   -> connector "${(await registry1.resolveCapability("test:fixture-execute")).connectorId}"`,
);
console.log();

console.log(
  "Scenario 2: Outside test mode, with no HubSpot credentials configured -- fails closed, per capability",
);
console.log("--------------------------------------------------");

const previousNodeEnv = process.env.NODE_ENV;
const previousToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

process.env.NODE_ENV = "production";
delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;

const registry2 = buildRegistry();

let hubspotError: string | undefined;
try {
  await registry2.resolveCapability("hubspot:deal-update");
} catch (error) {
  hubspotError = error instanceof Error ? error.message : String(error);
}
console.log(`hubspot:deal-update    -> throws: ${hubspotError}`);

// test-fixture (a NODE_ENV=test-only MockConnector) is ALSO absent
// outside test mode -- one missing connector's credentials never take
// the whole registry down, but every connector still fails closed
// independently on its own terms.
let testFixtureError: string | undefined;
try {
  await registry2.resolveCapability("test:fixture-execute");
} catch (error) {
  testFixtureError = error instanceof Error ? error.message : String(error);
}
console.log(`test:fixture-execute   -> throws: ${testFixtureError}`);
console.log();

process.env.NODE_ENV = previousNodeEnv;
if (previousToken !== undefined)
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = previousToken;

console.log(
  "Scenario 3: Outside test mode, WITH a real-looking HubSpot credential configured",
);
console.log("--------------------------------------------------");

process.env.NODE_ENV = "production";
process.env.HUBSPOT_PRIVATE_APP_TOKEN = "hubspot-tutorial-test-token";

const registry3 = buildRegistry();
console.log(
  `hubspot:deal-update    -> connector "${(await registry3.resolveCapability("hubspot:deal-update")).connectorId}"`,
);

delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
process.env.NODE_ENV = previousNodeEnv;
console.log();

const allPassed =
  (await registry1.resolveCapability("hubspot:deal-update")).connectorId ===
    "hubspot" &&
  (await registry1.resolveCapability("test:fixture-execute")).connectorId ===
    "test-fixture" &&
  hubspotError?.includes("hubspot:deal-update") === true &&
  testFixtureError?.includes("test:fixture-execute") === true &&
  (await registry3.resolveCapability("hubspot:deal-update")).connectorId ===
    "hubspot";

if (allPassed) {
  console.log(
    "✓ Capabilities resolve to their registered connector when credentials exist, and fail closed, per capability, when they don't.",
  );
} else {
  console.log(
    "✗ Expected every capability resolution above to match the credential-configuration state.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 82 - Composite Signal-State Verification");
