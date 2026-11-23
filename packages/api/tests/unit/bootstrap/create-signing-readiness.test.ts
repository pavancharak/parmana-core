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

describe("createSigningReadiness: local mode only (Gap C)", () => {
  const keys = [
    "NODE_ENV",
    "PARMANA_LOCAL_MODE",
    "SIGNING_READINESS_CHECK",
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
    process.env.SIGNING_READINESS_CHECK = "false";

    expect(createSigningReadiness()).toBeDefined();
  });

  it("is off in local mode unless SIGNING_READINESS_CHECK is 'true'", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_LOCAL_MODE = "true";
    delete process.env.SIGNING_READINESS_CHECK;

    expect(createSigningReadiness()).toBeUndefined();
  });
});
