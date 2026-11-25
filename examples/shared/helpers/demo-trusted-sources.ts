import type { JsonValue } from "@parmana/shared";
import {
  StaticBusinessSignalSourceRegistry,
  type BusinessSignalQuery,
  type BusinessSignalSource,
} from "@parmana/runtime";

/**
 * A demo business system for the tutorials.
 *
 * A policy that declares signalSources takes those facts from a business system, never from the caller. In
 * production the business system is registered through maker checker and answers over a signed endpoint. The
 * tutorials have no business system, so this demo one answers each sourced fact with the value the transaction
 * declares for it. withDemoApproval records those values before the transaction is executed.
 */
export const DEMO_TRUSTED_SOURCE = "trusted-test";

let demoFacts: Readonly<Record<string, unknown>> = {};

/** Records the facts the demo source answers with: the transaction's own declared values. */
export function recordDemoFacts(
  facts: Readonly<Record<string, unknown>> | undefined,
): void {
  demoFacts = { ...(facts ?? {}) };
}

/** The registry a tutorial passes to its runtime or application. */
export function demoTrustedSources(): StaticBusinessSignalSourceRegistry {
  const source: BusinessSignalSource = {
    name: DEMO_TRUSTED_SOURCE,
    async resolve(query: BusinessSignalQuery) {
      const value = demoFacts[query.signalKey];
      if (value === undefined) {
        return { kind: "not_found", reason: `no demo fact ${query.signalKey}` };
      }
      return {
        kind: "observed",
        value: value as JsonValue,
        sourceIdentity: DEMO_TRUSTED_SOURCE,
        observedAt: new Date(),
        validUntil: new Date(Date.now() + 60_000),
      };
    },
  };
  return new StaticBusinessSignalSourceRegistry([source]);
}
