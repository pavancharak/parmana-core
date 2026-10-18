import type { ExecutableContent } from "@parmana/shared";

/**
 * Maps verified executable content to the connector that should
 * execute it.
 *
 * Only consumed by ExecutionGateway's deprecated `executionControl.channel`
 * dispatch path (packages/execution-gateway/src/ExecutionGateway.ts) — not
 * by the `executionControl.service` path this repository actually wires
 * (see createExecutionGateway.ts), which resolves a connector via
 * ConnectorRegistry.resolveCapability instead. No connector is currently
 * registered under the legacy channel path, so this always throws; it
 * exists only to satisfy ExecutionControlOptions.route's required shape.
 * A prior "payments:execute" -> "vendor-payment" mapping was removed here
 * since that connector was never registered (docs/VERIFICATION-GAPS.md
 * G-27) and would have thrown at execution time regardless.
 */
export function createConnectorRoute() {
  return (content: Readonly<ExecutableContent>): string => {
    throw new Error(`No connector registered for action: ${content.action}.`);
  };
}
