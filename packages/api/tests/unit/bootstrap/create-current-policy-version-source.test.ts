import { afterEach, describe, expect, it } from "vitest";

import { createCurrentPolicyVersionSource } from "../../../src/bootstrap/createCurrentPolicyVersionSource.js";
import { GovernedPolicyVersionSource } from "../../../src/governance/GovernedPolicyVersionSource.js";

/**
 * G-66 and D18: the version in effect comes from policy governance in every
 * environment. No NODE_ENV or override setting turns it off, and there is
 * no fallback to the canonical table.
 */
describe("createCurrentPolicyVersionSource", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.PARMANA_ALLOW_UNGOVERNED_POLICY;
  const originalEnforce = process.env.POLICY_EXECUTION_VERIFICATION_ENFORCED;

  afterEach(() => {
    restore("NODE_ENV", originalNodeEnv);
    restore("PARMANA_ALLOW_UNGOVERNED_POLICY", originalAllow);
    restore("POLICY_EXECUTION_VERIFICATION_ENFORCED", originalEnforce);
  });

  it.each([
    ["production", undefined, undefined],
    ["staging", undefined, undefined],
    [undefined, undefined, undefined],
    ["test", "true", undefined],
    ["test", undefined, "false"],
    ["development", "true", undefined],
    ["development", "TRUE", "true"],
  ])(
    "is governed with NODE_ENV=%s, the ungoverned opt-in %s and enforcement %s",
    (nodeEnv, allow, enforce) => {
      setOrDelete("NODE_ENV", nodeEnv);
      setOrDelete("PARMANA_ALLOW_UNGOVERNED_POLICY", allow);
      setOrDelete("POLICY_EXECUTION_VERIFICATION_ENFORCED", enforce);

      expect(createCurrentPolicyVersionSource()).toBeInstanceOf(
        GovernedPolicyVersionSource,
      );
    },
  );
});

function setOrDelete(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function restore(key: string, value: string | undefined): void {
  setOrDelete(key, value);
}
