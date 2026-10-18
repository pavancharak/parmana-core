/**
 * Capabilities deliberately outside CANONICAL_CAPABILITY_POLICY_BINDINGS
 * (@parmana/policy, re-exported from @parmana/capability-registry), with
 * the reason each is exempt from assertConnectorCapabilitiesBound's
 * fail-closed check.
 *
 * A capability belongs here only when leaving it unbound is a
 * deliberate, reviewed decision — never as a way to silence the
 * assertion. Every entry must carry a non-empty reason (enforced by
 * assert-connector-capabilities-bound.test.ts).
 */
export const INTENTIONALLY_UNBOUND_CAPABILITIES: ReadonlyMap<string, string> =
  new Map([
    [
      "test:fixture-execute",

      "Test-only fixture connector (createTestFixtureConnector.ts), never " +
        "registered outside NODE_ENV=test, carries no production implication " +
        "-- see that file's own doc comment.",
    ],
  ]);
