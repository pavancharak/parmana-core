import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  PROBE_RETENTION_MIN_DAYS,
  PostgresKillSwitchProbePruner,
  assertPruneCutoffAllowed,
  probeRetentionCutoff,
} from "../../src/killSwitch/PostgresKillSwitchProbePruner.js";

const NOW = new Date("2027-06-01T12:00:00.000Z");
const ONE_YEAR_AGO = new Date("2026-06-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function fakePool(rowCount: number) {
  const query = vi.fn().mockResolvedValue({ rowCount });
  return { pool: { query } as unknown as Pool, query };
}

describe("probe retention cutoff", () => {
  it("is exactly the minimum retention before now", () => {
    expect(PROBE_RETENTION_MIN_DAYS).toBe(365);
    expect(probeRetentionCutoff(NOW).getTime()).toBe(
      NOW.getTime() - 365 * DAY_MS,
    );
  });
});

describe("assertPruneCutoffAllowed", () => {
  it("accepts a cutoff exactly one year before now", () => {
    expect(() => assertPruneCutoffAllowed(ONE_YEAR_AGO, NOW)).not.toThrow();
  });

  it("accepts any cutoff older than one year", () => {
    const older = new Date(ONE_YEAR_AGO.getTime() - DAY_MS);
    expect(() => assertPruneCutoffAllowed(older, NOW)).not.toThrow();
  });

  it("refuses a cutoff one millisecond too recent", () => {
    const tooRecent = new Date(ONE_YEAR_AGO.getTime() + 1);
    expect(() => assertPruneCutoffAllowed(tooRecent, NOW)).toThrow(
      /younger than 365 days/,
    );
  });

  it("refuses a cutoff of now", () => {
    expect(() => assertPruneCutoffAllowed(NOW, NOW)).toThrow(
      /younger than 365 days/,
    );
  });

  it("refuses an invalid date", () => {
    expect(() => assertPruneCutoffAllowed(new Date("not a date"), NOW)).toThrow(
      /not a valid date/,
    );
  });
});

describe("PostgresKillSwitchProbePruner", () => {
  it("deletes probes before an accepted cutoff and reports the count", async () => {
    const { pool, query } = fakePool(3);
    const pruner = new PostgresKillSwitchProbePruner(pool);

    await expect(pruner.pruneBefore(ONE_YEAR_AGO, NOW)).resolves.toBe(3);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from kill_switch_probe/);
    expect(sql).toMatch(/where probed_at < \$1/);
    expect(params).toEqual([ONE_YEAR_AGO]);
  });

  it("deletes nothing when the cutoff is too recent", async () => {
    const { pool, query } = fakePool(0);
    const pruner = new PostgresKillSwitchProbePruner(pool);

    const tooRecent = new Date(NOW.getTime() - DAY_MS);
    await expect(pruner.pruneBefore(tooRecent, NOW)).rejects.toThrow(
      /younger than 365 days/,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("reports zero when nothing is old enough to delete", async () => {
    const { pool } = fakePool(0);
    const pruner = new PostgresKillSwitchProbePruner(pool);

    await expect(pruner.pruneBefore(ONE_YEAR_AGO, NOW)).resolves.toBe(0);
  });
});
