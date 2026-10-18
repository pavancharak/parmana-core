import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildLlmsFullTxt,
  buildLlmsTxt,
} from "../../scripts/llms/buildLlmsTxt.js";

/**
 * docs/site/llms.txt and docs/site/llms-full.txt are generated from the docs
 * navigation, each page's frontmatter and the SDK package versions. They must
 * match a fresh generation, so an agent that reads them always sees the current
 * docs, current SDK versions and every page.
 *
 * When this fails, run `npm run generate:llms-txt` and commit the result.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

describe("llms.txt files are up to date", () => {
  it("docs/site/llms.txt matches a fresh generation", () => {
    const committed = normalize(
      readFileSync(join(repoRoot, "docs/site/llms.txt"), "utf8"),
    );

    expect(committed).toBe(normalize(buildLlmsTxt()));
  });

  it("docs/site/llms-full.txt matches a fresh generation", () => {
    const committed = normalize(
      readFileSync(join(repoRoot, "docs/site/llms-full.txt"), "utf8"),
    );

    expect(committed).toBe(normalize(buildLlmsFullTxt()));
  });

  it("the index lists the agent specification and the current SDK versions", () => {
    const index = buildLlmsTxt();

    expect(index).toContain("https://docs.parmanasystems.com/agents/integrate");
    expect(index).toContain("`@parmana/sdk`");
    expect(index).toContain("`parmana`");
  });
});
