import {
  MockConnector,
  connectorCapabilities,
  type Connector,
} from "@parmana/connector-sdk";

/**
 * Creates the generic test-fixture connector, or undefined outside
 * NODE_ENV=test.
 *
 * This exists solely so the shared test fixture
 * (packages/api/tests/fixtures/business-transaction.ts) has a real,
 * registered capability to execute against when submitted through the
 * real POST /execute route — the same role `createVendorPaymentConnector`
 * used to play, before `payments:execute`/vendor-payment was removed
 * entirely (docs/VERIFICATION-GAPS.md G-27) rather than independently
 * verified. Deliberately named and capability-scoped away from
 * `payments:execute`/`vendor-payment`: this is not a payment capability
 * of any kind, carries no production implication, is never registered
 * outside NODE_ENV=test, and has no entry in
 * CANONICAL_CAPABILITY_POLICY_BINDINGS (the same "unbound, entirely
 * unaffected by CapabilityPolicyBinder" category every other test/
 * tutorial/example fixture action already falls into).
 */
export function createTestFixtureConnector(): Connector | undefined {
  if (process.env.NODE_ENV !== "test") {
    return undefined;
  }

  return new MockConnector({
    connectorId: "test-fixture",

    capabilities: connectorCapabilities(["test:fixture-execute"]),
  });
}
