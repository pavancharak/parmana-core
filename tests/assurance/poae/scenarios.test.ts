import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scenarios = JSON.parse(
  readFileSync(
    join(root, "testing", "poae", "scenarios", "scenarios.json"),
    "utf8",
  ),
) as {
  statusVocabulary: string[];
  scenarios: {
    id: string;
    status: string;
    evidence: string | null;
    blockedBy: string | null;
  }[];
};
const runner = readFileSync(
  join(root, "tests", "assurance", "poae", "poae-benchmark.test.ts"),
  "utf8",
);

describe("PoAE scenario definitions (Phase 2)", () => {
  it("has exactly 30 scenarios, T01 to T30, with unique IDs", () => {
    const ids = scenarios.scenarios.map((s) => s.id).sort();
    const expected = Array.from(
      { length: 30 },
      (_, i) => `T${String(i + 1).padStart(2, "0")}`,
    );
    expect(ids).toEqual(expected);
  });

  it("uses only the status vocabulary", () => {
    for (const s of scenarios.scenarios) {
      expect(scenarios.statusVocabulary, s.id).toContain(s.status);
    }
  });

  it("every implemented scenario maps to a benchmark test ID in the runner", () => {
    for (const s of scenarios.scenarios.filter(
      (x) => x.status === "implemented",
    )) {
      expect(s.evidence, s.id).toBeTruthy();
      expect(
        runner.includes(`${s.evidence}:`) || runner.includes(`${s.evidence} `),
        s.id,
      ).toBe(true);
    }
  });

  it("every elsewhere scenario names an existing file", () => {
    for (const s of scenarios.scenarios.filter(
      (x) => x.status === "elsewhere",
    )) {
      expect(existsSync(join(root, s.evidence!)), s.id).toBe(true);
    }
  });

  it("every gap or partial scenario names what blocks it", () => {
    for (const s of scenarios.scenarios.filter(
      (x) => x.status === "gap" || x.status === "partial",
    )) {
      expect(s.blockedBy, s.id).toBeTruthy();
    }
  });

  it("the counts match the threat model: 18 implemented, 2 elsewhere, 1 gap, 1 partial, 8 not implemented", () => {
    const count = (st: string) =>
      scenarios.scenarios.filter((s) => s.status === st).length;
    expect(count("implemented")).toBe(18);
    expect(count("elsewhere")).toBe(2);
    expect(count("gap")).toBe(1);
    expect(count("partial")).toBe(1);
    expect(count("not_implemented")).toBe(8);
  });
});
