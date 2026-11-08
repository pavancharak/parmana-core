import { describe, expect, it } from "vitest";
import {
  assertProbeKeyEntry,
  PROBE_CALLER_ID,
  PROBE_CAPABILITY,
} from "../../../src/bootstrap/assertProbeKeyEntry.js";

const HASH = "a".repeat(64);

function probe(overrides: Record<string, unknown> = {}) {
  return {
    callerId: PROBE_CALLER_ID,
    keyHash: HASH,
    allowedCapabilities: [PROBE_CAPABILITY],
    ...overrides,
  };
}

describe("assertProbeKeyEntry", () => {
  it("accepts a probe entry that holds only the probe capability", () => {
    expect(() =>
      assertProbeKeyEntry([{ callerId: "operator-a", keyHash: HASH }, probe()]),
    ).not.toThrow();
  });

  it("refuses a list with no probe entry", () => {
    expect(() =>
      assertProbeKeyEntry([{ callerId: "operator-a", keyHash: HASH }]),
    ).toThrow(/has no "kill-switch-probe" entry/);
  });

  it("refuses an empty list", () => {
    expect(() => assertProbeKeyEntry([])).toThrow(/has no/);
  });

  it("refuses a probe entry with no capabilities", () => {
    expect(() =>
      assertProbeKeyEntry([probe({ allowedCapabilities: undefined })]),
    ).toThrow(/must hold exactly/);
  });

  it("refuses a probe entry with the wrong capability", () => {
    expect(() =>
      assertProbeKeyEntry([
        probe({ allowedCapabilities: ["kill-switch:trip"] }),
      ]),
    ).toThrow(/must hold exactly/);
  });

  it("refuses a probe entry that holds more than the probe capability", () => {
    expect(() =>
      assertProbeKeyEntry([
        probe({ allowedCapabilities: [PROBE_CAPABILITY, "kill-switch:trip"] }),
      ]),
    ).toThrow(/must hold exactly/);
  });
});
