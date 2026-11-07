import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sdkVersions } from "../../scripts/llms/buildLlmsTxt.js";

/**
 * The docs and llms.txt must name the SDK versions that are published on npm
 * and PyPI. Workspace versions in package.json and pyproject.toml change on a
 * version bump, which publishes nothing, so they are not the source for these
 * claims. scripts/llms/publishedSdkVersions.json is.
 *
 * When this fails after a release, update publishedSdkVersions.json and
 * regenerate llms.txt with `npm run generate:llms-txt`.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const docsRoot = join(repoRoot, "docs", "site");

const npmClaim = /`@parmana\/sdk`\s+(\d+\.\d+\.\d+)\s+on npm/g;
const pypiClaim = /`parmana`\s+(\d+\.\d+\.\d+)\s+on PyPI/g;

function docsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return docsFiles(path);
    return /\.(mdx?|txt)$/.test(name) ? [path] : [];
  });
}

function claims(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function packageJsonVersion(path: string): string {
  return (
    JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as { version: string }
  ).version;
}

function pyprojectVersion(path: string): string {
  const text = readFileSync(join(repoRoot, path), "utf8");
  const version = text.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) throw new Error(`no version in ${path}`);
  return version;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

describe("SDK versions in the docs are the published ones", () => {
  const published = sdkVersions();

  it("the llms.txt builder reads the published versions", () => {
    expect(published.typescript).toMatch(/^\d+\.\d+\.\d+$/);
    expect(published.python).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("llms.txt states the published versions", () => {
    const text = readFileSync(join(docsRoot, "llms.txt"), "utf8");

    expect(claims(text, npmClaim)).toEqual([published.typescript]);
    expect(claims(text, pypiClaim)).toEqual([published.python]);
  });

  it("every docs page that names an SDK version names the published one", () => {
    const mismatches: string[] = [];

    for (const file of docsFiles(docsRoot)) {
      const text = readFileSync(file, "utf8");
      const where = relative(repoRoot, file);

      for (const version of claims(text, npmClaim)) {
        if (version !== published.typescript) {
          mismatches.push(`${where}: @parmana/sdk ${version} on npm`);
        }
      }
      for (const version of claims(text, pypiClaim)) {
        if (version !== published.python) {
          mismatches.push(`${where}: parmana ${version} on PyPI`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("the SDK install table names the published versions", () => {
    const text = readFileSync(join(docsRoot, "choose-your-path.mdx"), "utf8");
    const npmRow = text.split("\n").find((line) => line.includes("[`@parmana/sdk`](/sdks/typescript) on npm"));
    const pypiRow = text.split("\n").find((line) => line.includes("[`parmana`](/sdks/python) on PyPI"));

    expect(npmRow, "npm row in choose-your-path.mdx").toBeDefined();
    expect(pypiRow, "PyPI row in choose-your-path.mdx").toBeDefined();
    expect(npmRow).toContain(` ${published.typescript} `);
    expect(pypiRow).toContain(` ${published.python} `);
  });

  it("a published version is never ahead of the workspace version", () => {
    const ts = packageJsonVersion("typescript/package.json");
    const py = pyprojectVersion("python/pyproject.toml");

    expect(compareSemver(published.typescript, ts)).toBeLessThanOrEqual(0);
    expect(compareSemver(published.python, py)).toBeLessThanOrEqual(0);
  });
});
