import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { mdxToMarkdown } from "../handbook/mdxToMarkdown.js";

describe("mdxToMarkdown (handbook PDF source)", () => {
  it("turns the frontmatter title into the page heading and drops the frontmatter", () => {
    const out = mdxToMarkdown(
      '---\ntitle: "Chapter 3: Cryptography"\ndescription: "x"\n---\n\nBody text.\n',
    );

    expect(out).toBe("# Chapter 3: Cryptography\n\nBody text.\n");
  });

  it("drops navigation cards, including multi line ones inside a card group", () => {
    const out = mdxToMarkdown(
      '---\ntitle: "Overview"\n---\nIntro.\n\n<CardGroup cols={2}>\n  <Card\n    title="Chapter 1"\n    href="/handbook/01"\n  />\n</CardGroup>\n\nAfter.\n',
    );

    expect(out).toBe("# Overview\n\nIntro.\n\nAfter.\n");
  });

  it("keeps the text of a callout and removes only its tags", () => {
    const out = mdxToMarkdown("<Info>\n  Keep this.\n</Info>\n");

    expect(out).toBe("Keep this.\n");
  });

  it("leaves generic types in code alone", () => {
    const out = mdxToMarkdown(
      "```ts\nconst x: Promise<ConnectorResponse> = f();\n```\n",
    );

    expect(out).toContain("Promise<ConnectorResponse>");
  });

  it("gives every real handbook chapter a heading and no leftover component tags", () => {
    const dir = path.resolve("docs/site/handbook");
    const chapters = readdirSync(dir).filter((f) => /^\d{2}-.*\.mdx$/.test(f));

    expect(chapters).toHaveLength(23);
    for (const file of chapters) {
      const out = mdxToMarkdown(readFileSync(path.join(dir, file), "utf8"));
      expect(out.startsWith("# Chapter ")).toBe(true);
      expect(out).not.toMatch(/<\/?(Card|CardGroup|Info|Note|Tip|Warning)\b/);
    }
  });
});
