import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every environment variable the server source reads must be documented, so
 * the reference page and .env.example cannot silently fall behind the code.
 *
 * Adding process.env.SOMETHING anywhere under packages/*\/src fails this test
 * until SOMETHING is listed in docs/site/deployment/environment-variables.mdx
 * and in .env.example.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const REFERENCE_PAGE = "docs/site/deployment/environment-variables.mdx";
const ENV_EXAMPLE = ".env.example";

/**
 * Variables the server deliberately still mentions but that must NOT be set.
 * DATABASE_PROVIDER was removed: the server refuses to start if it is set, so
 * it belongs on the reference page (as a removed variable) but not in
 * .env.example.
 */
const NOT_IN_ENV_EXAMPLE = new Set(["DATABASE_PROVIDER"]);

function sourceFiles(directory: string): string[] {
  const out: string[] = [];

  for (const name of readdirSync(directory)) {
    if (name === "node_modules" || name === "dist") continue;

    const path = join(directory, name);
    const info = statSync(path);

    if (info.isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (path.endsWith(".ts") && !path.endsWith(".d.ts")) {
      out.push(path);
    }
  }

  return out;
}

function serverEnvironmentVariables(): string[] {
  const names = new Set<string>();
  const packagesDirectory = join(repoRoot, "packages");

  for (const packageName of readdirSync(packagesDirectory)) {
    const src = join(packagesDirectory, packageName, "src");

    if (!existsSync(src)) continue;

    for (const file of sourceFiles(src)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();

        if (
          trimmed.startsWith("*") ||
          trimmed.startsWith("//") ||
          trimmed.startsWith("/*")
        ) {
          continue;
        }

        for (const match of trimmed.matchAll(
          /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g,
        )) {
          names.add((match[1] ?? match[2]) as string);
        }
      }
    }
  }

  return [...names].sort();
}

describe("environment variables are documented", () => {
  const variables = serverEnvironmentVariables();
  const referencePage = readFileSync(join(repoRoot, REFERENCE_PAGE), "utf8");
  const envExample = readFileSync(join(repoRoot, ENV_EXAMPLE), "utf8");

  it("finds the variables the server reads (guards against a broken scanner)", () => {
    expect(variables.length).toBeGreaterThan(40);
    expect(variables).toContain("PARMANA_API_KEYS");
    expect(variables).toContain("PARMANA_POLICY_DIR");
    expect(variables).toContain("DATABASE_URL");
  });

  it("lists every variable on the reference page", () => {
    const missing = variables.filter(
      (name) => !referencePage.includes(`\`${name}\``),
    );

    expect(
      missing,
      `Add these to ${REFERENCE_PAGE} (Variable, Required, Default, Values, What it does): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("lists every variable in .env.example, commented out if optional", () => {
    const missing = variables.filter(
      (name) =>
        !NOT_IN_ENV_EXAMPLE.has(name) &&
        !new RegExp(`^#?\\s*${name}=`, "m").test(envExample),
    );

    expect(
      missing,
      `Add these to ${ENV_EXAMPLE} as NAME=value or a commented # NAME=value: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("does not put the removed DATABASE_PROVIDER variable in .env.example", () => {
    expect(/^#?\s*DATABASE_PROVIDER=/m.test(envExample)).toBe(false);
  });
});
