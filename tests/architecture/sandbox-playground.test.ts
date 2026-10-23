import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The Playground page (docs/site/playground.mdx, ADR-0014 step 4) shows
 * four scripts that were run against the live sandbox before they were
 * published: examples/sandbox-playground. These tests keep the page and
 * the files the same, keep the sandbox the first server of the API
 * reference with the demo key prefilled, and keep that one demo key the
 * same everywhere it is printed.
 */

const root = process.cwd();
const read = (...parts: string[]) =>
  readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");

const page = read("docs", "site", "playground.mdx");
const samples = [
  "playground.sh",
  "playground.ps1",
  "playground.ts",
  "playground.py",
];

const spec = parse(read("openapi", "openapi.yaml")) as {
  servers: { url: string; description: string }[];
  components: {
    securitySchemes: { bearerAuth: Record<string, unknown> };
  };
};
const demoKey = spec.components.securitySchemes.bearerAuth["x-default"];

describe("the sandbox playground", () => {
  it.each(samples)(
    "shows %s exactly as the file in examples/sandbox-playground",
    (name) => {
      const sample = read("examples", "sandbox-playground", name).trimEnd();

      expect(page).toContain(sample);
    },
  );

  it("has a cURL script that is valid shell", () => {
    expect(() =>
      execFileSync(
        "bash",
        [
          "-n",
          // Relative, forward slashes: works for Linux bash, Git Bash and
          // WSL's bash, which mangles an absolute Windows path.
          "examples/sandbox-playground/playground.sh",
        ],
        { cwd: root },
      ),
    ).not.toThrow();
  });

  it("is in the navigation, after the introduction", () => {
    const docs = read("docs", "site", "docs.json");

    expect(docs).toMatch(/"index",\s*"playground",/);
  });

  it("makes the sandbox the first server, before production", () => {
    expect(spec.servers.map((server) => server.url)).toEqual([
      "https://parmana-sandbox.vercel.app",
      "https://parmana-api-real.vercel.app",
      "http://localhost:3000",
    ]);
  });

  it("prefills one demo key, the same on the page and in every script", () => {
    expect(typeof demoKey).toBe("string");
    expect(page).toContain(`Authorization: Bearer ${String(demoKey)}`);
    expect(read("examples", "sandbox-playground", "playground.sh")).toContain(
      `export PARMANA_API_KEY=${String(demoKey)}`,
    );
    expect(read("examples", "sandbox-playground", "playground.ps1")).toContain(
      `$env:PARMANA_API_KEY = "${String(demoKey)}"`,
    );
  });
});
