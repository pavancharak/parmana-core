import { afterEach, describe, expect, it } from "vitest";

import { CachedSigningReadiness } from "@parmana/runtime";

import { createSigningReadiness } from "../../../src/bootstrap/createSigningReadiness.js";

const ENABLE_KEY = "SIGNING_READINESS_CHECK";

describe("createSigningReadiness", () => {
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

    expect(createSigningReadiness()).toBeInstanceOf(CachedSigningReadiness);
  });

  it("cannot be switched off in production by the env var", () => {
    process.env.NODE_ENV = "production";

    for (const value of ["false", "0", "", "no"]) {
      process.env[ENABLE_KEY] = value;

      expect(createSigningReadiness()).toBeInstanceOf(CachedSigningReadiness);
    }
  });

  it("is enforced when NODE_ENV is unset or unrecognized (fail closed)", () => {
    delete process.env.NODE_ENV;
    expect(createSigningReadiness()).toBeInstanceOf(CachedSigningReadiness);

    process.env.NODE_ENV = "staging";
    expect(createSigningReadiness()).toBeInstanceOf(CachedSigningReadiness);
  });

  it("stays off in test and development unless explicitly 'true'", () => {
    for (const env of ["test", "development"]) {
      process.env.NODE_ENV = env;
      delete process.env[ENABLE_KEY];
      expect(createSigningReadiness()).toBeUndefined();

      process.env[ENABLE_KEY] = "1";
      expect(createSigningReadiness()).toBeUndefined();

      process.env[ENABLE_KEY] = "true";
      expect(createSigningReadiness()).toBeInstanceOf(CachedSigningReadiness);
    }
  });
});
