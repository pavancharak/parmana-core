import { describe, expect, it } from "vitest";

import {
  assertLocalModeConfigured,
  localModeEnabled,
} from "../../../src/bootstrap/localMode.js";

const env = (values: Record<string, string | undefined>) =>
  values as NodeJS.ProcessEnv;

describe("localModeEnabled (Gap C)", () => {
  it("is off when the flag is not set, whatever NODE_ENV says", () => {
    expect(localModeEnabled(env({ NODE_ENV: "test" }))).toBe(false);
    expect(localModeEnabled(env({ NODE_ENV: "development" }))).toBe(false);
  });

  it.each([["test"], ["development"]])(
    "is on only with the flag and NODE_ENV=%s",
    (nodeEnv) => {
      expect(
        localModeEnabled(
          env({ NODE_ENV: nodeEnv, PARMANA_LOCAL_MODE: "true" }),
        ),
      ).toBe(true);
    },
  );

  it.each([["production"], ["staging"], ["Test"], [undefined]])(
    "is off with the flag and NODE_ENV=%s (enforce, do not relax)",
    (nodeEnv) => {
      expect(
        localModeEnabled(
          env({ NODE_ENV: nodeEnv, PARMANA_LOCAL_MODE: "true" }),
        ),
      ).toBe(false);
    },
  );

  it("requires the exact value 'true'", () => {
    expect(
      localModeEnabled(env({ NODE_ENV: "test", PARMANA_LOCAL_MODE: "TRUE" })),
    ).toBe(false);
    expect(
      localModeEnabled(env({ NODE_ENV: "test", PARMANA_LOCAL_MODE: "1" })),
    ).toBe(false);
  });
});

describe("assertLocalModeConfigured (startup refusal)", () => {
  it("passes when the flag is absent", () => {
    expect(() =>
      assertLocalModeConfigured(env({ NODE_ENV: "production" })),
    ).not.toThrow();
  });

  it("passes when the flag and NODE_ENV agree", () => {
    expect(() =>
      assertLocalModeConfigured(
        env({ NODE_ENV: "test", PARMANA_LOCAL_MODE: "true" }),
      ),
    ).not.toThrow();
  });

  it("refuses the flag under NODE_ENV=production", () => {
    expect(() =>
      assertLocalModeConfigured(
        env({ NODE_ENV: "production", PARMANA_LOCAL_MODE: "true" }),
      ),
    ).toThrow(/PARMANA_LOCAL_MODE=true is refused unless NODE_ENV is exactly/);
  });
});
