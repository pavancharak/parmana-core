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

describe("executionIntentsEnforced: local mode only (Gap C)", () => {
  const keys = [
    "NODE_ENV",
    "PARMANA_LOCAL_MODE",
    "EXECUTION_INTENTS_CHECK",
  ] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("stays enforced under NODE_ENV=test without local mode", () => {
    process.env.NODE_ENV = "test";
    delete process.env.PARMANA_LOCAL_MODE;
    process.env.EXECUTION_INTENTS_CHECK = "false";

    expect(executionIntentsEnforced()).toBe(true);
  });

  it("is off in local mode unless EXECUTION_INTENTS_CHECK is 'true'", () => {
    process.env.NODE_ENV = "development";
    process.env.PARMANA_LOCAL_MODE = "true";
    delete process.env.EXECUTION_INTENTS_CHECK;

    expect(executionIntentsEnforced()).toBe(false);
  });
});
