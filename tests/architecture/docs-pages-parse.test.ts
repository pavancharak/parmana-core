import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { compile } from "@mdx-js/mdx";
import { describe, expect, it } from "vitest";

/**
 * Every page of the docs site must parse as MDX. A page that does not is
 * published by Mintlify "with errors" and is missing or broken on the
 * live site, and nothing else fails: on 2026-10-01 two pages had been
 * broken that way (an unclosed code fence inside a <Step>, and a
 * placeholder written as <action> in plain text).
 */

const siteRoot = path.join(process.cwd(), "docs", "site");

function mdxPages(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);

    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return mdxPages(full);

    return name.endsWith(".mdx") ? [full] : [];
  });
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

describe("docs site pages", () => {
  const pages = mdxPages(siteRoot);

  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(100);
  });

  it("parses every page as MDX", async () => {
    const failures: string[] = [];

    for (const page of pages) {
      const source = readFileSync(page, "utf8").replace(FRONTMATTER, "");

      try {
        await compile(source);
      } catch (error) {
        failures.push(
          `${path.relative(siteRoot, page)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  }, 120_000);
});
