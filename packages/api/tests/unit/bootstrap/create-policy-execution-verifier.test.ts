import { afterEach, describe, expect, it } from "vitest";

import { PolicyGovernanceExecutionVerifier } from "../../../src/governance/PolicyGovernanceExecutionVerifier.js";
import { createPolicyExecutionVerifier } from "../../../src/bootstrap/createPolicyExecutionVerifier.js";

const ENFORCE_KEY = "POLICY_EXECUTION_VERIFICATION_ENFORCED";

describe("createPolicyExecutionVerifier", () => {
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

  it("is enforced by default in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env[ENFORCE_KEY];

    expect(createPolicyExecutionVerifier()).toBeInstanceOf(
      PolicyGovernanceExecutionVerifier,
    );
  });

  it("cannot be switched off in production by the env var", () => {
    process.env.NODE_ENV = "production";

    for (const value of ["false", "0", "", "no", "TRUE"]) {
      process.env[ENFORCE_KEY] = value;

      expect(createPolicyExecutionVerifier()).toBeInstanceOf(
        PolicyGovernanceExecutionVerifier,
      );
    }
  });

  it("is enforced when NODE_ENV is unset or unrecognized (fail closed)", () => {
    delete process.env.NODE_ENV;
    expect(createPolicyExecutionVerifier()).toBeInstanceOf(
      PolicyGovernanceExecutionVerifier,
    );

    process.env.NODE_ENV = "staging";
    expect(createPolicyExecutionVerifier()).toBeInstanceOf(
      PolicyGovernanceExecutionVerifier,
    );
  });

  it("stays off in test and development unless explicitly 'true'", () => {
    for (const env of ["test", "development"]) {
      process.env.NODE_ENV = env;
      delete process.env[ENFORCE_KEY];
      expect(createPolicyExecutionVerifier()).toBeUndefined();

      process.env[ENFORCE_KEY] = "1";
      expect(createPolicyExecutionVerifier()).toBeUndefined();

      process.env[ENFORCE_KEY] = "true";
      expect(createPolicyExecutionVerifier()).toBeInstanceOf(
        PolicyGovernanceExecutionVerifier,
      );
    }
  });
});
