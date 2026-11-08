import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Node major version is set in four places: package.json `engines`, the
 * CI workflows, the Dockerfile base images, and the Vercel project setting
 * (which the repository cannot read; see docs/internal/runbooks/NODE-VERSION.md).
 * This suite fails when the repository's three places disagree, so a change
 * to one cannot land without the others. Moving to a new major version is a
 * deliberate change to all of them, with a test run on that version first.
 */
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

const major = (version: string) => version.match(/^(\d+)/)?.[1];

describe("the Node major version is the same everywhere in the repository", () => {
  const engines = JSON.parse(read("package.json")).engines.node as string;
  const workflowDir = path.join(root, ".github/workflows");
  const workflows = readdirSync(workflowDir).filter((f) => f.endsWith(".yml"));

  it("package.json pins engines.node to the tested major version", () => {
    expect(engines).toBe("24.x");
  });

  it("every CI workflow pins node-version to the same major, to an exact release", () => {
    const pins: string[] = [];
    for (const file of workflows) {
      for (const m of read(`.github/workflows/${file}`).matchAll(
        /node-version:\s*["']?(\d+\.\d+\.\d+|\d+)["']?/g,
      )) {
        pins.push(m[1]!);
      }
    }
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) {
      expect(major(pin)).toBe(major(engines));
      expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("the Dockerfile builds and runs on the same major version, pinned by digest", () => {
    const froms = [...read("Dockerfile").matchAll(/^FROM (node:[^\s]+)/gm)].map(
      (m) => m[1]!,
    );
    expect(froms.length).toBeGreaterThan(0);
    for (const from of froms) {
      expect(from).toMatch(
        new RegExp(`^node:${major(engines)}(-slim)?@sha256:[0-9a-f]{64}$`),
      );
    }
  });
});
