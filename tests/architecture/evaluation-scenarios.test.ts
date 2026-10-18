import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * evaluations/scenarios.json drives `npm run evaluate`. These checks keep
 * it honest: a renamed or deleted test file, or a claim number that no
 * longer exists in docs/CLAIMS.md, fails here rather than turning a
 * scenario into NOT RUN for an evaluator.
 */

interface Scenario {
  id: string;
  slug: string;
  title: string;
  attackerControls: string;
  attack: string;
  invariant: string;
  claims: string[];
  tests: string[];
}

const root = process.cwd();
const { scenarios } = JSON.parse(
  readFileSync(path.join(root, "evaluations", "scenarios.json"), "utf8"),
) as { scenarios: Scenario[] };
const claims = readFileSync(path.join(root, "docs", "CLAIMS.md"), "utf8");

describe("evaluation scenarios", () => {
  it("has unique ids and slugs, numbered EV-01 onward", () => {
    expect(scenarios.length).toBeGreaterThan(0);
    scenarios.forEach((scenario, index) => {
      expect(scenario.id).toBe(`EV-${String(index + 1).padStart(2, "0")}`);
    });
    expect(new Set(scenarios.map((s) => s.slug)).size).toBe(scenarios.length);
  });

  it.each(scenarios.map((s) => [s.id, s] as const))(
    "%s describes the attack and the invariant",
    (_id, scenario) => {
      for (const field of [
        "title",
        "attackerControls",
        "attack",
        "invariant",
      ] as const) {
        expect(scenario[field].trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(scenarios.map((s) => [s.id, s] as const))(
    "%s names test files that exist",
    (_id, scenario) => {
      expect(scenario.tests.length).toBeGreaterThan(0);
      for (const file of scenario.tests) {
        expect(file).toMatch(/\.test\.ts$/);
        expect(existsSync(path.join(root, file)), file).toBe(true);
      }
    },
  );

  it.each(scenarios.map((s) => [s.id, s] as const))(
    "%s cites claims that exist in docs/CLAIMS.md",
    (_id, scenario) => {
      for (const claim of scenario.claims) {
        expect(claims, claim).toMatch(
          new RegExp(`^## ${claim.replace(".", "\\.")} `, "m"),
        );
      }
    },
  );
});

describe("the Reproduce column on the Claims and evidence page", () => {
  const page = readFileSync(
    path.join(root, "docs", "site", "evaluation", "claims-and-evidence.mdx"),
    "utf8",
  );
  const ids = new Set(scenarios.map((s) => s.id));

  it("names only scenarios that exist", () => {
    const named = [...page.matchAll(/npm run evaluate -- ([^`]+)`/g)].flatMap(
      (match) => match[1]!.trim().split(/\s+/),
    );
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) expect(ids.has(id), id).toBe(true);
  });

  it("names only test files that exist", () => {
    const files = [...page.matchAll(/npx vitest run ([^`]+)`/g)].flatMap(
      (match) => match[1]!.trim().split(/\s+/),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(existsSync(path.join(root, file)), file).toBe(true);
    }
  });
});

describe("THREAT-MODEL.md", () => {
  const model = readFileSync(path.join(root, "THREAT-MODEL.md"), "utf8");
  const ids = new Set(scenarios.map((s) => s.id));

  it("names only scenarios that exist", () => {
    const named = [...model.matchAll(/\bEV-\d{2}\b/g)].map((m) => m[0]);
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) expect(ids.has(id), id).toBe(true);
  });

  it("cites only claims that exist in docs/CLAIMS.md", () => {
    const rows = model.split("\n").filter((line) => /^\| T\d+ /.test(line));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const evidence = row.split("|")[5] ?? "";
      for (const [claim] of evidence.matchAll(/\b\d\.\d{1,2}\b/g)) {
        expect(claims, `${row.split("|")[1]?.trim()}: ${claim}`).toMatch(
          new RegExp(`^## ${claim.replace(".", "\\.")} `, "m"),
        );
      }
    }
  });
});
