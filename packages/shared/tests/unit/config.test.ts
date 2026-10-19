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
  const originalAcknowledged = process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED;

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

    if (originalAcknowledged === undefined) {
      delete process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED;
    } else {
      process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED = originalAcknowledged;
    }
  });

  it("defaults to schema version 2 when HYBRID_SCHEMA_VERSION is unset", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    delete process.env.HYBRID_SCHEMA_VERSION;

    expect(loadConfig().crypto.hybridSchemaVersion).toBe(2);
  });

  it("refuses schema version 3 unless the acknowledgement is set", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    process.env.HYBRID_SCHEMA_VERSION = "3";
    delete process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED;

    expect(() => loadConfig()).toThrow("HYBRID_SCHEMA_V3_ACKNOWLEDGED=true");
  });

  it("refuses schema version 3 when the acknowledgement is anything but the exact string true", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    process.env.HYBRID_SCHEMA_VERSION = "3";
    process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED = "yes";

    expect(() => loadConfig()).toThrow("HYBRID_SCHEMA_V3_ACKNOWLEDGED=true");
  });

  it("accepts schema version 3 when acknowledged", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    process.env.HYBRID_SCHEMA_VERSION = "3";
    process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED = "true";

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

describe("loadConfig hybridRequiredFrom (ADR-0016 cutover)", () => {
  const originalPolicyDir = process.env.PARMANA_POLICY_DIR;
  const originalCutover = process.env.HYBRID_REQUIRED_FROM;

  afterEach(() => {
    if (originalPolicyDir === undefined) {
      delete process.env.PARMANA_POLICY_DIR;
    } else {
      process.env.PARMANA_POLICY_DIR = originalPolicyDir;
    }

    if (originalCutover === undefined) {
      delete process.env.HYBRID_REQUIRED_FROM;
    } else {
      process.env.HYBRID_REQUIRED_FROM = originalCutover;
    }
  });

  it("has no cutover when HYBRID_REQUIRED_FROM is unset", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    delete process.env.HYBRID_REQUIRED_FROM;

    expect(loadConfig().crypto.hybridRequiredFrom).toBeUndefined();
  });

  it("reads a UTC cutover", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    process.env.HYBRID_REQUIRED_FROM = "2026-01-01T00:00:00.000Z";

    expect(loadConfig().crypto.hybridRequiredFrom).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("refuses a cutover without a UTC designator", () => {
    process.env.PARMANA_POLICY_DIR = "./policies";
    process.env.HYBRID_REQUIRED_FROM = "2026-01-01T00:00:00.000";

    expect(() => loadConfig()).toThrow(
      'HYBRID_REQUIRED_FROM must be an ISO-8601 UTC timestamp ending in "Z"',
    );
  });
});
