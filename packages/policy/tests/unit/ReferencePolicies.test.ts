import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { PolicyValidator } from "../../src/PolicyValidator.js";
import type { Policy } from "../../src/types/Policy.js";

function findPolicyFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...findPolicyFiles(fullPath));
    } else if (entry.isFile() && entry.name === "policy.json") {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

describe("Reference Policy Library", () => {
  const validator = new PolicyValidator();

  const policiesRoot = path.resolve(
    import.meta.dirname,
    "../../../../policies",
  );

  const policyFiles = findPolicyFiles(policiesRoot);

  expect(policyFiles.length).toBeGreaterThan(0);

  //
  // The newest version of every policy must load. An older version is
  // kept as history; it either loads or is refused only because it
  // approves without a signed human approval, which no agent action
  // may ever do.
  //
  const latestVersion = new Map<string, string>();

  for (const file of policyFiles) {
    const [name, version] = path.relative(policiesRoot, file).split(path.sep);
    const current = latestVersion.get(name!);

    if (current === undefined || compareVersions(version!, current) > 0) {
      latestVersion.set(name!, version!);
    }
  }

  for (const file of policyFiles) {
    const relativePath = path.relative(policiesRoot, file);

    it(relativePath, () => {
      console.log("Validating:", relativePath);

      const text = readFileSync(file, "utf8");

      expect(text.trim().length).toBeGreaterThan(0);

      let policy: Policy;

      try {
        policy = JSON.parse(text) as Policy;
      } catch (error) {
        throw new Error(`Failed to parse JSON in ${relativePath}`, {
          cause: error,
        });
      }

      const [name, version] = relativePath.split(path.sep);

      if (latestVersion.get(name!) === version) {
        expect(() => validator.validate(policy)).not.toThrow();
        return;
      }

      try {
        validator.validate(policy);
      } catch (error) {
        expect((error as Error).message).toMatch(
          /approves without a signed human approval/,
        );
      }
    });
  }
});
