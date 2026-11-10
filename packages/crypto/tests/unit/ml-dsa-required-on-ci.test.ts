import { describe, expect, it } from "vitest";

import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

/**
 * The hybrid and whole-record suites skip themselves when ML-DSA-65 is not
 * available. On a CI runner that is supposed to run them, a skip would pass
 * the build with that coverage silently missing. CI runs Node 24, so this test
 * fails there when ML-DSA-65 is unavailable. Elsewhere it is skipped.
 */
const isCiOnNode24 =
  process.env["CI"] === "true" &&
  Number(process.versions.node.split(".")[0]) >= 24;

describe("ML-DSA-65 on CI", () => {
  it.skipIf(!isCiOnNode24)(
    "CI's Node 24 runner can run ML-DSA-65, so the hybrid suites run rather than skip",
    () => {
      expect(isMlDsa65Supported(), ML_DSA_65_SKIP_REASON).toBe(true);
    },
  );
});
