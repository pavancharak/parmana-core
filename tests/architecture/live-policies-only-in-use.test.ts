import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The live policies/ folder holds only the policies in use. Older policies
 * live under fixtures/policies/ and are read only by tests and examples
 * that test or show them. This test fails if any code reads a retired
 * policy from the live folder, so the fixtures are the only source for them.
 */

const root = path.resolve(import.meta.dirname, "../..");

const LIVE = new Set(["payment-refund"]);

const RETIRED = [
  "access-control",
  "agent-vendor-payment",
  "api-key-issuance",
  "connector-capability",
  "customer-refund",
  "database-change",
  "expense-reimbursement",
  "llm-tool-call",
  "nbfc-loan-disbursement",
  "production-deployment",
  "rag-document-access",
  "razorpay-refund",
  "standard-org-baseline",
  "vendor-payment",
];

// The approval-log test checks the message the approval-log script prints for a
// retired policy. That message names the path the script reads, so the file is
// exempt. Add a file here only with a reason in the same place.
const ALLOWED_FILES = new Set(["scripts/tests/policy-approval-log.test.ts"]);

const SCANNED = [
  "packages",
  "examples",
  "tests",
  "scripts",
  "typescript/test",
  "python/tests",
  "test-support",
  "fixtures",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === "dist" || name.startsWith("."))
      return [];
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|mts|js|mjs|py)$/.test(name) ? [full] : [];
  });
}

describe("the live policies folder is read only for policies in use", () => {
  it("no code reads a retired policy from the live policies/ folder", () => {
    const offenders: string[] = [];
    const pattern = new RegExp(
      `(^|[^/a-zA-Z0-9_-])policies[/"'\\\\]+(${RETIRED.join("|")})\\b`,
    );
    for (const scanned of SCANNED) {
      const dir = path.join(root, scanned);
      if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
      for (const file of files(dir)) {
        const relative = path.relative(root, file).split(path.sep).join("/");
        if (ALLOWED_FILES.has(relative)) continue;
        const text = readFileSync(file, "utf8");
        const lines = text.split("\n");
        lines.forEach((line, index) => {
          if (/fixtures[/"'\\\\]+policies/.test(line)) return;
          if (pattern.test(line)) {
            offenders.push(`${path.relative(root, file)}:${index + 1}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the live policies folder contains only policies in use", () => {
    const live = readdirSync(path.join(root, "policies")).sort();
    expect(live.every((name) => LIVE.has(name))).toBe(true);
  });
});
