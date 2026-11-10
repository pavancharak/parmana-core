import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { format, resolveConfig } from "prettier";
import { describe, expect, it } from "vitest";

import { hintCodes } from "../src/hints.js";
import { renderReference } from "../src/reference.js";
import { COMMANDS } from "../src/spec.js";

/** The repository root, three folders above this test file. */
const repoRoot = join(import.meta.dirname, "..", "..", "..");
const docsDir = join(repoRoot, "docs", "site", "cli");

const CLI_PAGES = [
  "quickstart",
  "concepts",
  "reference",
  "configuration",
  "errors",
  "recipes",
  "security",
  "changelog",
];

describe("CLI documentation", () => {
  it("the reference page matches the command table exactly", async () => {
    const target = join(docsDir, "reference.mdx");
    const options = (await resolveConfig(target)) ?? {};
    const expected = await format(renderReference(), {
      ...options,
      filepath: target,
    });
    expect(readFileSync(target, "utf8")).toBe(expected);
  });

  it("the reference lists every command", () => {
    const reference = readFileSync(join(docsDir, "reference.mdx"), "utf8");
    for (const command of COMMANDS) {
      expect(reference).toContain(`## \`${command.id}\``);
    }
  });

  it("the errors page documents every server code the CLI gives a hint for", () => {
    const errors = readFileSync(join(docsDir, "errors.mdx"), "utf8");
    for (const code of hintCodes()) {
      expect(errors, `missing ${code}`).toContain(`\`${code}\``);
    }
  });

  it("every CLI page exists and is in the navigation", () => {
    const nav = readFileSync(
      join(repoRoot, "docs", "site", "docs.json"),
      "utf8",
    );
    for (const page of CLI_PAGES) {
      expect(
        existsSync(join(docsDir, `${page}.mdx`)),
        `missing page ${page}`,
      ).toBe(true);
      expect(nav, `not in navigation: ${page}`).toContain(`"cli/${page}"`);
    }
  });
});
