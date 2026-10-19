import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/Config.js";

describe("loadConfig", () => {
  const originalPolicyDir = process.env.PARMANA_POLICY_DIR;

  afterEach(() => {
    if (originalPolicyDir === undefined) {
      delete process.env.PARMANA_POLICY_DIR;
    } else {
      process.env.PARMANA_POLICY_DIR = originalPolicyDir;
    }
  });

  it("refuses to start when PARMANA_POLICY_DIR is unset", () => {
    delete process.env.PARMANA_POLICY_DIR;

    expect(() => loadConfig()).toThrow(
      "PARMANA_POLICY_DIR is not set. Refusing to start",
    );
  });

  it("refuses to start when PARMANA_POLICY_DIR is blank", () => {
    process.env.PARMANA_POLICY_DIR = "   ";

    expect(() => loadConfig()).toThrow(
      "PARMANA_POLICY_DIR is not set. Refusing to start",
    );
  });

  it("loads the configured policy directory", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";

    expect(loadConfig().policy.directory).toBe("./policies");
  });
});

describe("loadConfig hybridSchemaVersion (ADR-0016)", () => {
  const originalPolicyDir = process.env.PARMANA_POLICY_DIR;
  const originalSchemaVersion = process.env.HYBRID_SCHEMA_VERSION;

  afterEach(() => {
    if (originalPolicyDir === undefined) {
      delete process.env.PARMANA_POLICY_DIR;
    } else {
      process.env.PARMANA_POLICY_DIR = originalPolicyDir;
    }

    if (originalSchemaVersion === undefined) {
      delete process.env.HYBRID_SCHEMA_VERSION;
    } else {
      process.env.HYBRID_SCHEMA_VERSION = originalSchemaVersion;
    }
  });

  it("defaults to schema version 2 when HYBRID_SCHEMA_VERSION is unset", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    delete process.env.HYBRID_SCHEMA_VERSION;

    expect(loadConfig().crypto.hybridSchemaVersion).toBe(2);
  });

  it("accepts schema version 3", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    process.env.HYBRID_SCHEMA_VERSION = "3";

    expect(loadConfig().crypto.hybridSchemaVersion).toBe(3);
  });

  it("refuses any other value rather than guessing a schema version", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    process.env.HYBRID_SCHEMA_VERSION = "4";

    expect(() => loadConfig()).toThrow(
      'HYBRID_SCHEMA_VERSION must be 2 or 3, got "4".',
    );
  });
});
