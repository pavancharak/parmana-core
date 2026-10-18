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
