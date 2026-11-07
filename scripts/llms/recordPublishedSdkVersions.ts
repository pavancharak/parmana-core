/**
 * Records the SDK versions that are published on npm and PyPI, then regenerates
 * the llms.txt files from them.
 *
 * Run it after a release is published, with the versions that were published:
 *
 *   npm run record:published-sdk -- --typescript 2.0.0 --python 2.0.0
 *
 * It refuses to write unless the registry serves the version, so the docs never
 * name a version that cannot be installed. A version bump in package.json
 * publishes nothing, which is why this check reads the registries, not the
 * workspace.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const target = join(repoRoot, "scripts", "llms", "publishedSdkVersions.json");

const SEMVER = /^\d+\.\d+\.\d+$/;

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || !SEMVER.test(value)) {
    throw new Error(`--${name} must be a version such as 2.0.0`);
  }
  return value;
}

function npmServes(pkg: string, version: string): boolean {
  try {
    const out = execFileSync("npm", ["view", `${pkg}@${version}`, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").some((line) => line.trim() === version);
  } catch {
    return false;
  }
}

async function pypiServes(pkg: string, version: string): Promise<boolean> {
  const response = await fetch(
    `https://pypi.org/pypi/${pkg}/${version}/json`,
  );
  return response.status === 200;
}

async function main(): Promise<void> {
  const typescript = arg("typescript");
  const python = arg("python");

  const checks: [string, boolean][] = [
    [`npm @parmana/sdk@${typescript}`, npmServes("@parmana/sdk", typescript)],
    [`PyPI parmana==${python}`, await pypiServes("parmana", python)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `not published, nothing recorded: ${missing.join(", ")}`,
    );
  }

  writeFileSync(target, `${JSON.stringify({ typescript, python }, null, 2)}\n`);
  console.log(`recorded typescript ${typescript}, python ${python}`);
  console.log("next: npm run generate:llms-txt, then commit both files");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
