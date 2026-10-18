import { afterEach, describe, expect, it } from "vitest";

import {
  createExecutionIntents,
  executionIntentsEnforced,
} from "../../../src/bootstrap/createExecutionIntents.js";
import { executionIntentRepository } from "../../../src/repositories.js";

const ENABLE_KEY = "EXECUTION_INTENTS_CHECK";

describe("createExecutionIntents (ADR-0012)", () => {
  const originalEnable = process.env[ENABLE_KEY];
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnable === undefined) delete process.env[ENABLE_KEY];
    else process.env[ENABLE_KEY] = originalEnable;

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("is enforced by default in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env[ENABLE_KEY];

    expect(executionIntentsEnforced()).toBe(true);
    expect(createExecutionIntents()).toBe(executionIntentRepository);
  });

  it("cannot be switched off in production by the env var", () => {
    process.env.NODE_ENV = "production";

    for (const value of ["false", "0", "", "no"]) {
      process.env[ENABLE_KEY] = value;

      expect(executionIntentsEnforced()).toBe(true);
      expect(createExecutionIntents()).toBe(executionIntentRepository);
    }
  });

  it("is enforced when NODE_ENV is unset or unrecognized (fail closed)", () => {
    delete process.env.NODE_ENV;
    expect(executionIntentsEnforced()).toBe(true);

    process.env.NODE_ENV = "staging";
    expect(executionIntentsEnforced()).toBe(true);
    expect(createExecutionIntents()).toBe(executionIntentRepository);
  });

  it("stays off in test and development unless explicitly 'true'", () => {
    for (const env of ["test", "development"]) {
      process.env.NODE_ENV = env;
      delete process.env[ENABLE_KEY];
      expect(executionIntentsEnforced()).toBe(false);
      expect(createExecutionIntents()).toBeUndefined();

      process.env[ENABLE_KEY] = "1";
      expect(createExecutionIntents()).toBeUndefined();

      process.env[ENABLE_KEY] = "true";
      expect(executionIntentsEnforced()).toBe(true);
      expect(createExecutionIntents()).toBe(executionIntentRepository);
    }
  });
});
