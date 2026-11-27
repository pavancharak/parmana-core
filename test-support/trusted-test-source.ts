/**
 * TEST DATA ONLY. Never used by a deployment.
 *
 * The in-process business signal source the Python live-server tests run against. It is the same
 * trusted source the TypeScript tests use, answering each policy signal from fixed facts. The facts
 * are keyed by the business object (the subject), so a test chooses its outcome by choosing its
 * target. The default subject passes every check; RISKY_SUBJECT is assessed above the threshold.
 *
 * The Python helper in python/tests/test_live_server_integration.py picks RISKY_SUBJECT whenever a
 * test asks for a risk score other than the default, so the two must not drift.
 */
import type { JsonValue } from "@parmana/shared";
import {
  StaticBusinessSignalSourceRegistry,
  type BusinessSignalQuery,
  type BusinessSignalSource,
} from "@parmana/runtime";

/** The name the test policies give their trusted source (see fixtures/policies/payment-limit). */
export const TRUSTED_TEST_SOURCE = "trusted-test";

/** The subject whose assessed risk is above the policy's threshold. */
export const RISKY_SUBJECT = "vendor/V-python-sdk-risky";

/**
 * The risk score each test subject is assessed at. A subject not listed is assessed at DEFAULT_RISK_SCORE.
 * "vendor://payments" is the quickstart's subject, and its documented score (python/examples/quickstart) is
 * 5: the source must agree with what the example declares, or business validation refuses it.
 */
const RISK_SCORE_BY_SUBJECT: Readonly<Record<string, number>> = {
  [RISKY_SUBJECT]: 999,
  "vendor://payments": 5,
};
const DEFAULT_RISK_SCORE = 10;

function factsFor(subject: string): Readonly<Record<string, JsonValue>> {
  return {
    vendorVerified: true,
    invoiceVerified: true,
    paymentApproved: true,
    sufficientFunds: true,
    riskScore: RISK_SCORE_BY_SUBJECT[subject] ?? DEFAULT_RISK_SCORE,
  };
}

/** The registry the test server passes to startServer. Answers each sourced fact from the subject's facts. */
export function trustedTestSources(): StaticBusinessSignalSourceRegistry {
  const source: BusinessSignalSource = {
    name: TRUSTED_TEST_SOURCE,
    async resolve(query: BusinessSignalQuery) {
      const value = factsFor(query.subject)[query.signalKey];
      if (value === undefined) {
        return { kind: "not_found", reason: `no test fact ${query.signalKey}` };
      }
      return {
        kind: "observed",
        value,
        sourceIdentity: TRUSTED_TEST_SOURCE,
        observedAt: new Date(),
        validUntil: new Date(Date.now() + 60_000),
      };
    },
  };
  return new StaticBusinessSignalSourceRegistry([source]);
}
