import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ENDPOINTS_DIRECTORY,
  GUIDE_GROUP_NAME,
  REST_TAB_NAME,
  buildEndpointNavGroups,
  buildEndpointPages,
} from "../../scripts/endpoints/buildEndpointPages.js";

/**
 * Every OpenAPI operation has a documentation page under
 * docs/site/api-reference/endpoints, and the REST API tab in docs.json lists
 * them. The pages are generated from the bundled OpenAPI file, so the endpoint
 * reference can never disagree with the spec, and a new endpoint cannot ship
 * without a page.
 *
 * When this fails, run `npm run openapi && npm run generate:endpoint-pages` and
 * commit the result.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

describe("endpoint reference pages are up to date", () => {
  const pages = buildEndpointPages();

  it("finds the operations in the spec (guards against a broken generator)", () => {
    expect(pages.length).toBeGreaterThan(25);
    expect(pages.map((page) => `${page.method} ${page.path}`)).toContain(
      "POST /execute",
    );
  });

  it("has exactly one page per operation, with generated content", () => {
    for (const page of pages) {
      const file = join(repoRoot, page.file);

      expect(existsSync(file), `${page.file} is missing`).toBe(true);
      expect(normalize(readFileSync(file, "utf8"))).toBe(
        normalize(page.content),
      );
    }
  });

  it("has no page for an operation that no longer exists", () => {
    const expected = new Set(pages.map((page) => `${page.slug}.mdx`));
    const actual = readdirSync(join(repoRoot, ENDPOINTS_DIRECTORY));

    expect(actual.filter((name) => !expected.has(name))).toEqual([]);
  });

  it("lists every endpoint page in the REST API tab of docs.json", () => {
    const docs = JSON.parse(
      readFileSync(join(repoRoot, "docs/site/docs.json"), "utf8"),
    ) as {
      navigation: {
        tabs: Array<{
          tab: string;
          groups: Array<{ group: string; pages: string[] }>;
        }>;
      };
    };

    const restTab = docs.navigation.tabs.find(
      (tab) => tab.tab === REST_TAB_NAME,
    );

    expect(restTab).toBeDefined();
    expect(restTab?.groups[0]?.group).toBe(GUIDE_GROUP_NAME);
    expect(restTab?.groups.slice(1)).toEqual(buildEndpointNavGroups(pages));
  });
});
