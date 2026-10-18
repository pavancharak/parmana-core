import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BUILT_IN_CONNECTOR_VARIABLES } from "../../packages/api/src/bootstrap/createSandboxOptions.js";

/**
 * Sandbox mode refuses to start while a built in connector is configured
 * (ADR-0014). That guard is only as good as its list of variables, so
 * this keeps the list complete in two ways:
 *
 * 1. Every variable read by the code that decides whether a built in
 *    connector is registered: createConnectorRegistry and the connector
 *    and credential provider factories it calls. This catches a variable
 *    whose name does not look like a connector's, such as
 *    PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID.
 * 2. Every PAYTM_, HUBSPOT_, GITHUB_ and SLACK_ variable read anywhere in
 *    the server's source.
 *
 * NODE_ENV and the TEST_ variables are read only under NODE_ENV=test,
 * which a sandbox never runs.
 */

const root = process.cwd();
const bootstrap = path.join(root, "packages", "api", "src", "bootstrap");
const listed = new Set<string>(BUILT_IN_CONNECTOR_VARIABLES);

function variablesRead(file: string): string[] {
  return [
    ...readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g),
  ].map((match) => match[1] ?? "");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);

    if (statSync(full).isDirectory()) {
      return ["node_modules", "dist", "tests"].includes(entry)
        ? []
        : sourceFiles(full);
    }

    return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
  });
}

describe("sandbox mode's built in connector variables", () => {
  it("lists every variable that decides whether a built in connector is registered", () => {
    const registry = path.join(bootstrap, "createConnectorRegistry.ts");
    const imported = [
      ...readFileSync(registry, "utf8").matchAll(
        /from "\.\/(create(?:HubSpot|GitHub|Paytm|Slack)[A-Za-z]*)\.js"/g,
      ),
    ].map((match) => path.join(bootstrap, `${match[1]}.ts`));

    const credentialProviders = ["HubSpot", "GitHub", "Paytm", "Slack"].map(
      (name) => path.join(bootstrap, `create${name}CredentialProvider.ts`),
    );

    const files = [registry, ...imported, ...credentialProviders].filter(
      (file) => existsSync(file),
    );

    expect(files.length).toBeGreaterThanOrEqual(9);

    const decisive = new Set(
      files
        .flatMap(variablesRead)
        .filter((name) => name !== "NODE_ENV" && !name.startsWith("TEST_")),
    );

    expect([...decisive].filter((name) => !listed.has(name))).toEqual([]);
  });

  it("lists every connector prefixed variable the server reads", () => {
    const packages = path.join(root, "packages");
    const read = new Set<string>();

    for (const name of readdirSync(packages)) {
      const src = path.join(packages, name, "src");

      if (!existsSync(src)) continue;

      for (const file of sourceFiles(src)) {
        for (const variable of variablesRead(file)) {
          if (/^(?:PAYTM|HUBSPOT|GITHUB|SLACK)_/.test(variable)) {
            read.add(variable);
          }
        }
      }
    }

    expect(read.size).toBeGreaterThan(0);
    expect([...read].filter((name) => !listed.has(name))).toEqual([]);
  });
});
