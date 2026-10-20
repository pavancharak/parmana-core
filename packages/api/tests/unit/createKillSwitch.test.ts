import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createKillSwitch } from "../../src/bootstrap/createKillSwitch.js";

/**
 * The kill switch is off unless enabled, and an enabled switch must state the
 * reset rule and have a database. A bad setting stops startup (ADR-0017).
 */
describe("createKillSwitch (ADR-0017)", () => {
  const saved = {
    enabled: process.env.KILL_SWITCH_ENABLED,
    twoPerson: process.env.KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR,
    databaseUrl: process.env.DATABASE_URL,
  };

  beforeEach(() => {
    delete process.env.KILL_SWITCH_ENABLED;
    delete process.env.KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR;
    process.env.DATABASE_URL = "postgresql://postgres@127.0.0.1:1/unused";
  });

  afterEach(() => {
    for (const [key, value] of [
      ["KILL_SWITCH_ENABLED", saved.enabled],
      ["KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR", saved.twoPerson],
      ["DATABASE_URL", saved.databaseUrl],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("is not created when KILL_SWITCH_ENABLED is unset", () => {
    expect(createKillSwitch()).toBeUndefined();
  });

  it("is not created when KILL_SWITCH_ENABLED is false", () => {
    process.env.KILL_SWITCH_ENABLED = "false";
    expect(createKillSwitch()).toBeUndefined();
  });

  it("refuses a value other than true or false", () => {
    process.env.KILL_SWITCH_ENABLED = "yes";
    expect(() => createKillSwitch()).toThrow('must be "true" or "false"');
  });

  it("refuses to enable without stating the reset rule", () => {
    process.env.KILL_SWITCH_ENABLED = "true";
    expect(() => createKillSwitch()).toThrow(
      "KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR",
    );
  });

  it("refuses to enable without DATABASE_URL", () => {
    process.env.KILL_SWITCH_ENABLED = "true";
    process.env.KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR = "true";
    delete process.env.DATABASE_URL;

    expect(() => createKillSwitch()).toThrow(
      "KillSwitch requires DATABASE_URL",
    );
  });

  it("creates a durable switch when enabled with the reset rule and a database", () => {
    process.env.KILL_SWITCH_ENABLED = "true";
    process.env.KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR = "true";

    expect(createKillSwitch()).toBeDefined();
  });
});
