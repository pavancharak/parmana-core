import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every release publishes every package in .github/release/release-manifest.json,
 * at the manifest's version. This test fails when the manifest, the package
 * versions, the release workflow or the release runbook disagree, so a release
 * cannot quietly leave an SDK out.
 */

const repoRoot = join(import.meta.dirname, "..", "..");

interface Manifest {
  readonly version: string;
  readonly npm: readonly string[];
  readonly pypi: readonly string[];
  readonly verifier: readonly string[];
}

const manifest = JSON.parse(
  readFileSync(
    join(repoRoot, ".github", "release", "release-manifest.json"),
    "utf8",
  ),
) as Manifest;
const workflow = readFileSync(
  join(repoRoot, ".github", "workflows", "release.yml"),
  "utf8",
);
const runbook = readFileSync(
  join(repoRoot, "docs", "internal", "runbooks", "RELEASE-ALL-PACKAGES.md"),
  "utf8",
);

/** npm package name -> the directory, relative to the repo root, holding its package.json. */
function npmDirectories(): Map<string, string> {
  const found = new Map<string, string>();
  const candidates = [
    "typescript",
    ...readdirSync(join(repoRoot, "packages")).map((d) => join("packages", d)),
  ];
  for (const dir of candidates) {
    const file = join(repoRoot, dir, "package.json");
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8")) as { name: string };
    // Workflows use forward slashes on every platform; join() gives backslashes on Windows.
    found.set(json.name, dir.replace(/\\/g, "/"));
  }
  return found;
}

/** The Python directory for each PyPI package in the manifest. */
const PYTHON_DIRECTORIES: Readonly<Record<string, string>> = {
  parmana: "python",
  "parmana-connector-sdk": "python-connector-sdk",
};

function pythonVersion(dir: string): string | undefined {
  const text = readFileSync(join(repoRoot, dir, "pyproject.toml"), "utf8");
  return /^version = "([^"]+)"/m.exec(text)?.[1];
}

describe("release manifest", () => {
  const directories = npmDirectories();

  it.each(manifest.npm)(
    "%s is in the workspace at the manifest version",
    (name) => {
      const dir = directories.get(name);
      expect(dir, `no workspace package named ${name}`).toBeDefined();
      const json = JSON.parse(
        readFileSync(join(repoRoot, dir as string, "package.json"), "utf8"),
      ) as {
        version: string;
      };
      expect(json.version).toBe(manifest.version);
    },
  );

  it.each(manifest.npm)("%s is packed by the release workflow", (name) => {
    const dir = directories.get(name) as string;
    expect(workflow).toContain(`--workspace=${dir}`);
  });

  it.each([...manifest.npm, ...manifest.pypi, ...manifest.verifier])(
    "%s is named in the release runbook",
    (name) => {
      expect(runbook).toContain(`\`${name}\``);
    },
  );

  it.each(manifest.pypi)("%s (Python) is at the manifest version", (name) => {
    const dir = PYTHON_DIRECTORIES[name];
    expect(dir, `no Python directory mapped for ${name}`).toBeDefined();
    expect(pythonVersion(dir as string)).toBe(manifest.version);
  });

  it("pins the CLI container to the manifest version", () => {
    const dockerfile = readFileSync(join(repoRoot, "Dockerfile.cli"), "utf8");
    expect(dockerfile).toContain(
      `ARG PARMANA_CLI_VERSION=${manifest.version}\n`,
    );
  });
});
