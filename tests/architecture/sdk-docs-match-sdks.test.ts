import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  checkSdkDocs,
  sdkSurfaces,
} from "../../scripts/sdkdocs/checkSdkDocs.js";

/**
 * The SDK documentation must match the real SDKs.
 *
 * 1. Every name a docs code block imports, every method it calls on a client and
 *    every constructor option it passes must exist.
 * 2. The two configuration and behavior reference pages must cover every public
 *    client method and every option, so a new method or option cannot ship
 *    undocumented.
 *
 * Needs typescript/dist, which the repository's dist freshness check guarantees.
 * When (2) fails, add the missing name to the page.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function page(path: string): string {
  return readFileSync(join(repoRoot, "docs", "site", `${path}.mdx`), "utf8");
}

describe("SDK docs match the SDKs", () => {
  it("every name used in the docs code blocks exists in the real SDK", () => {
    expect(checkSdkDocs()).toEqual([]);
  });

  it("the TypeScript reference page covers every client method and option", () => {
    const surface = sdkSurfaces().typescript;
    const text = page("sdks/typescript-configuration");

    const methods = surface.clientMembers.filter(
      (name) => name !== "configuration",
    );

    expect(methods.length).toBeGreaterThan(10);
    expect(surface.configurationKeys.length).toBeGreaterThan(4);

    expect(
      methods.filter((name) => !text.includes(`\`${name}(`)),
      "client methods missing from sdks/typescript-configuration",
    ).toEqual([]);

    expect(
      surface.configurationKeys.filter((key) => !text.includes(`\`${key}\``)),
      "configuration options missing from sdks/typescript-configuration",
    ).toEqual([]);
  });

  it("the Python reference page covers every client method, sub API and option", () => {
    const surface = sdkSurfaces().python;
    const text = page("sdks/python-configuration");

    expect(surface.clientMethods.length).toBeGreaterThan(8);
    expect(surface.subApis.length).toBeGreaterThan(6);

    expect(
      surface.clientMethods.filter((name) => !text.includes(`\`${name}`)),
      "client methods missing from sdks/python-configuration",
    ).toEqual([]);

    expect(
      surface.constructorParameters.filter(
        (name) => !text.includes(`\`${name}\``),
      ),
      "constructor arguments missing from sdks/python-configuration",
    ).toEqual([]);

    for (const api of surface.subApis) {
      const row = text
        .split("\n")
        .find((line) => line.includes(`\`client.${api.name}\``));

      expect(row, `sub API client.${api.name} missing`).toBeDefined();

      for (const method of api.methods) {
        expect(
          row?.includes(`\`${method}\``),
          `client.${api.name}.${method} missing`,
        ).toBe(true);
      }
    }
  });
});
