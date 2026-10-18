import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GAPS_FILE,
  REMAINING_FILE,
  readGaps,
  renderTable,
  spliceTable,
} from "../../scripts/gap-status.js";

/**
 * docs/REMAINING-WORK.md's gap status table is generated from the Status lines of
 * docs/VERIFICATION-GAPS.md. A hand edit, or a gap whose status moves without the
 * table, fails here. Regenerate with: npx tsx scripts/gap-status.ts
 */
describe("gap status table", () => {
  it("matches the Status lines in docs/VERIFICATION-GAPS.md", () => {
    const rows = readGaps(readFileSync(GAPS_FILE, "utf8"));
    expect(rows.length).toBeGreaterThan(0);

    const remaining = readFileSync(REMAINING_FILE, "utf8");
    expect(spliceTable(remaining, renderTable(rows))).toBe(remaining);
  });
});
