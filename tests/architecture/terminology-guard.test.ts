import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Phase 2C — regression coverage for the CI terminology guard
 * (.github/workflows/ci.yml, "Guard against retired terminology" step).
 *
 * The guard itself is inline bash with no test of its own — this is what
 * let TD-2 (the repository certification record, in git history) go
 * unnoticed: the guard silently failed against the committed tree with
 * nobody finding out until someone happened to run it by hand. This file re-implements the guard's
 * exact matching logic in TypeScript so its behavior is asserted on every
 * `npm test` run, not just when CI happens to execute the workflow step.
 *
 * The exclusion list below MUST be kept in sync with ci.yml's `--exclude`
 * flags by hand — there is no shared source of truth, the same tradeoff
 * documentation-references.test.ts already accepts for its own doc list.
 * If you change one, change the other.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const FORBIDDEN_PHRASE = /execution governance/i;

/**
 * Basenames excluded from the guard, mirroring ci.yml exactly. Each is
 * legitimate for one of two reasons — see ci.yml's own comment for the
 * full rationale per file:
 *   (1) historical self-narration of this repo's own retired term
 *   (2) third-party citation of an unrelated, differently-authored work
 *       that happens to share the name "Execution Governance"
 */
const EXCLUDED_BASENAMES = new Set([
  "VERIFICATION-GAPS.md",
  "how-parmana-thinks.mdx",
  "execution-authorization.mdx",
  "changelog.mdx",
  "ci.yml",
  // This file: its own matching pattern and test fixtures necessarily
  // reference the retired phrase, same reason ci.yml excludes itself.
  "terminology-guard.test.ts",
]);

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

/** Recursively lists all files under `dir`, skipping excluded directories. */
function listFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }

  return results;
}

/** Re-implements the guard: every file, minus the excluded basenames, checked for the phrase. */
function findViolations(): string[] {
  const violations: string[] = [];

  for (const file of listFiles(repoRoot)) {
    const basename = file.split(/[/\\]/).pop()!;
    if (EXCLUDED_BASENAMES.has(basename)) continue;

    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // binary or unreadable file — same as grep -I skipping it
    }

    if (FORBIDDEN_PHRASE.test(content)) {
      violations.push(file);
    }
  }

  return violations;
}

describe("CI terminology guard (Phase 2C regression coverage)", () => {
  it("the repository, as checked by the guard, currently has zero violations", () => {
    expect(findViolations()).toEqual([]);
  });

  it("active documentation contains no instance of the retired phrase, excluded or not", () => {
    const activeDocs = [
      "README.md",
      "docs/architecture/system-architecture.md",
      "docs/site/architecture/execution-pipeline.mdx",
      "docs/architecture/repository-invariants.md",
      "docs/connectors/BUILDING_A_CONNECTOR.md",
    ];

    for (const doc of activeDocs) {
      const content = readFileSync(join(repoRoot, doc), "utf8");
      expect(
        FORBIDDEN_PHRASE.test(content),
        `${doc} must not contain the retired phrase`,
      ).toBe(false);
    }
  });

  it("historical self-narration files are excluded and legitimately contain the phrase", () => {
    const historical = ["docs/VERIFICATION-GAPS.md", "docs/site/changelog.mdx"];

    for (const doc of historical) {
      const basename = doc.split("/").pop()!;
      expect(
        EXCLUDED_BASENAMES.has(basename),
        `${doc} must be in the exclusion list`,
      ).toBe(true);

      const content = readFileSync(join(repoRoot, doc), "utf8");
      expect(
        FORBIDDEN_PHRASE.test(content),
        `${doc} is expected to contain the phrase (that's why it's excluded)`,
      ).toBe(true);
    }
  });

  it("third-party-citation files are excluded and legitimately contain the phrase", () => {
    const citations = [
      "docs/site/how-parmana-thinks.mdx",
      "docs/site/concepts/execution-authorization.mdx",
    ];

    for (const doc of citations) {
      const basename = doc.split("/").pop()!;
      expect(
        EXCLUDED_BASENAMES.has(basename),
        `${doc} must be in the exclusion list`,
      ).toBe(true);

      const content = readFileSync(join(repoRoot, doc), "utf8");
      expect(
        FORBIDDEN_PHRASE.test(content),
        `${doc} is expected to contain the phrase (that's why it's excluded)`,
      ).toBe(true);
    }
  });

  it("new, unlisted legacy terminology is still detected (sanity check the guard isn't vacuous)", () => {
    // Not a real file on disk — proves the matcher itself still fires on
    // content it hasn't been told to ignore, without touching the repo.
    const probeContent =
      "This document describes our Execution Governance layer.";
    expect(FORBIDDEN_PHRASE.test(probeContent)).toBe(true);

    const probeBasename = "not-a-real-excluded-file.md";
    expect(EXCLUDED_BASENAMES.has(probeBasename)).toBe(false);
  });

  it("legitimate current terminology (Execution Trust, Policy Engine) never trips the guard", () => {
    const benign =
      "This mentions Execution Trust and Policy Engine, both legitimate current terms.";
    expect(FORBIDDEN_PHRASE.test(benign)).toBe(false);
  });
});
