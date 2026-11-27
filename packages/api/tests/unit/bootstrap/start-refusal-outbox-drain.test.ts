import { describe, expect, it } from "vitest";

import { refusalOutboxSecondsFrom } from "../../../src/bootstrap/startRefusalOutboxDrain.js";

describe("refusalOutboxSecondsFrom (RFC-0021)", () => {
  it("defaults to 30 seconds when unset or blank", () => {
    expect(refusalOutboxSecondsFrom({})).toBe(30);
    expect(
      refusalOutboxSecondsFrom({ PARMANA_REFUSAL_OUTBOX_SECONDS: "  " }),
    ).toBe(30);
  });

  it("accepts whole seconds from 1 to 86400", () => {
    expect(
      refusalOutboxSecondsFrom({ PARMANA_REFUSAL_OUTBOX_SECONDS: "1" }),
    ).toBe(1);
    expect(
      refusalOutboxSecondsFrom({ PARMANA_REFUSAL_OUTBOX_SECONDS: "86400" }),
    ).toBe(86400);
  });

  it.each(["0", "-5", "1.5", "abc", "86401"])(
    "refuses %s at startup",
    (raw) => {
      expect(() =>
        refusalOutboxSecondsFrom({ PARMANA_REFUSAL_OUTBOX_SECONDS: raw }),
      ).toThrow(/PARMANA_REFUSAL_OUTBOX_SECONDS must be a whole number/);
    },
  );
});
