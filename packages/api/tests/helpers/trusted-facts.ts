import type { JsonValue } from "@parmana/shared";
import {
  StaticBusinessSignalSourceRegistry,
  type BusinessSignalQuery,
  type BusinessSignalSource,
} from "@parmana/runtime";

/** The name the test policies give their trusted source (see fixtures/policies/payment-limit). */
export const TRUSTED_TEST_SOURCE = "trusted-test";

/**
 * A trusted source for tests, with a fact book the test fills in. Each sourced fact is answered from the book.
 * A test sets the book from the facts it declares, so the approval comes from the source's answer and the
 * declared value only has to agree with it.
 */
export const PAYMENT_FACTS: Readonly<Record<string, unknown>> = {
  vendorVerified: true,
  invoiceVerified: true,
  paymentApproved: true,
  sufficientFunds: true,
  riskScore: 10,
};

export function createTrustedFacts(
  defaults: Readonly<Record<string, unknown>> = PAYMENT_FACTS,
): {
  readonly registry: StaticBusinessSignalSourceRegistry;
  set(facts: Readonly<Record<string, unknown>>): void;
} {
  let book: Readonly<Record<string, unknown>> = { ...defaults };
  const source: BusinessSignalSource = {
    name: TRUSTED_TEST_SOURCE,
    async resolve(query: BusinessSignalQuery) {
      const value = book[query.signalKey];
      if (value === undefined) {
        return { kind: "not_found", reason: `no fact ${query.signalKey}` };
      }
      return {
        kind: "observed",
        value: value as JsonValue,
        sourceIdentity: TRUSTED_TEST_SOURCE,
        observedAt: new Date(),
        validUntil: new Date(Date.now() + 60_000),
      };
    },
  };
  return {
    registry: new StaticBusinessSignalSourceRegistry([source]),
    set(facts) {
      book = { ...facts };
    },
  };
}
