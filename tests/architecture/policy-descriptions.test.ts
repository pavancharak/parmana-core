import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every policy's description is shown to approvers and recorded in the approval
 * chain. A malformed description (stray punctuation, a doubled full stop, an
 * unfinished sentence) would be approved as written, and changing it afterwards
 * needs a new approval. This test catches those in CI, before a proposal is made.
 */

const root = path.resolve(import.meta.dirname, "../..");
const policiesRoot = path.join(root, "policies");

function policyFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return policyFiles(full);
    return name === "policy.json" ? [full] : [];
  });
}

describe("policy descriptions are well formed", () => {
  const files = policyFiles(policiesRoot);

  it("finds the policies to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");

    it(`${relative} has a description that ends in one full stop and has no stray punctuation`, () => {
      const description = JSON.parse(readFileSync(file, "utf8")).description;
      expect(typeof description).toBe("string");
      expect(description.trim()).toBe(description);
      expect(description).toMatch(/[.!?]$/);
      expect(description).not.toMatch(/[.,;:!?]{2,}/);
      expect(description).not.toMatch(/,\s*[.!?]$/);
    });
  }
});
