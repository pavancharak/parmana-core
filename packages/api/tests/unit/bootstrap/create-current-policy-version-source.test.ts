import { afterEach, describe, expect, it } from "vitest";

import { createCurrentPolicyVersionSource } from "../../../src/bootstrap/createCurrentPolicyVersionSource.js";
import { createPolicyExecutionVerifier } from "../../../src/bootstrap/createPolicyExecutionVerifier.js";
import { GovernedPolicyVersionSource } from "../../../src/governance/GovernedPolicyVersionSource.js";

const ENFORCE_KEY = "POLICY_EXECUTION_VERIFICATION_ENFORCED";

/**
 * G-66: the version in effect comes from policy governance exactly where
 * policy governance is enforced, never in one without the other.
 */
describe("createCurrentPolicyVersionSource", () => {
  const originalEnforce = process.env[ENFORCE_KEY];
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnforce === undefined) {
      delete process.env[ENFORCE_KEY];
    } else {
      process.env[ENFORCE_KEY] = originalEnforce;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it.each([
    ["production", undefined],
    ["production", "false"],
    [undefined, undefined],
    ["staging", undefined],
    ["test", undefined],
    ["test", "true"],
    ["development", undefined],
    ["development", "true"],
    ["development", "TRUE"],
  ])(
    "matches policy governance enforcement with NODE_ENV=%s and the override %s",
    (nodeEnv, enforce) => {
      if (nodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = nodeEnv;
      }

      if (enforce === undefined) {
        delete process.env[ENFORCE_KEY];
      } else {
        process.env[ENFORCE_KEY] = enforce;
      }

      const governed = createPolicyExecutionVerifier() !== undefined;
      const source = createCurrentPolicyVersionSource();

      expect(source !== undefined).toBe(governed);

      if (governed) {
        expect(source).toBeInstanceOf(GovernedPolicyVersionSource);
      }
    },
  );

  it("is on in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env[ENFORCE_KEY];

    expect(createCurrentPolicyVersionSource()).toBeInstanceOf(
      GovernedPolicyVersionSource,
    );
  });
});
