import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RFC-0028: core holds no vendor credential.
 *
 * Connector credentials belong to the connector services, which read
 * their own secrets at call time. Core must never read a vendor
 * credential from its environment, in any mode. This test scans every
 * server source file (packages/*\/src and api/) and fails if one reads a
 * variable with a vendor prefix.
 *
 * It is broader than sandbox-connector-variables.test.ts, which covers
 * only sandbox mode and four prefixes. This one covers every mode and
 * every vendor prefix, so a new connector cannot add a credential to core
 * without failing the build. Test files are excluded, since a test may
 * set a fake value for a connector.
 */

const root = process.cwd();

/** Vendor prefixes whose credentials must never be read by core. */
const VENDOR_PREFIXES = [
  "RAZORPAY_",
  "PAYTM_",
  "SLACK_",
  "HUBSPOT_",
  "GITHUB_",
  "ZERODHA_",
  "ZOHO_",
  "KITE_",
] as const;

function serverSourceFiles(): string[] {
  const roots = [path.join(root, "api")];
  const packagesDir = path.join(root, "packages");

  for (const name of readdirSync(packagesDir)) {
    const src = path.join(packagesDir, name, "src");

    if (statSync(src, { throwIfNoEntry: false })?.isDirectory()) {
      roots.push(src);
    }
  }

  return roots.flatMap(listTs);
}

function listTs(directory: string): string[] {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", "tests"].includes(entry.name)) return [];

    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) return listTs(full);

    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("core holds no vendor credential (RFC-0028)", () => {
  it("scans a non-empty set of server source files", () => {
    expect(serverSourceFiles().length).toBeGreaterThan(50);
  });

  it("reads no vendor-prefixed environment variable in any mode", () => {
    const violations: string[] = [];

    for (const file of serverSourceFiles()) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1] ?? "";

        if (VENDOR_PREFIXES.some((prefix) => name.startsWith(prefix))) {
          violations.push(`${path.relative(root, file)} reads ${name}`);
        }
      }

      for (const match of source.matchAll(
        /process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g,
      )) {
        const name = match[1] ?? "";

        if (VENDOR_PREFIXES.some((prefix) => name.startsWith(prefix))) {
          violations.push(`${path.relative(root, file)} reads ${name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
