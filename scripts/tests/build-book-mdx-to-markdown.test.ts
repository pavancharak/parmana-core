import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DOCS_SITE_URL, mdxToMarkdown } from "../build-book/mdxToMarkdown.js";

describe("mdxToMarkdown (build book PDF source)", () => {
  it("drops MDX comments", () => {
    const out = mdxToMarkdown(
      '---\ntitle: "Reference"\n---\n\n{/* Generated. Do not edit. */}\n\nBody.\n',
    );

    expect(out).toBe("# Reference\n\nBody.\n");
  });

  it("removes CodeGroup wrappers and the tab title after a fence language", () => {
    const out = mdxToMarkdown(
      "<CodeGroup>\n\n```typescript TypeScript\nconst a = 1;\n```\n\n```python Python\na = 1\n```\n\n</CodeGroup>\n",
    );

    expect(out).toBe(
      "```typescript\nconst a = 1;\n```\n\n```python\na = 1\n```\n",
    );
  });

  it("keeps a fence with a language and no title as it is", () => {
    expect(mdxToMarkdown("```json\n{}\n```\n")).toBe("```json\n{}\n```\n");
  });

  it("makes links into the docs site absolute and leaves other links alone", () => {
    const out = mdxToMarkdown(
      "See [Chapter 4](/build-book/04-policies) and [Resend](https://resend.com).\n",
    );

    expect(out).toBe(
      `See [Chapter 4](${DOCS_SITE_URL}/build-book/04-policies) and [Resend](https://resend.com).\n`,
    );
  });

  it("leaves no MDX component in any book page", () => {
    const dir = path.resolve(process.cwd(), "docs/site/build-book");

    for (const file of readdirSync(dir).filter((name) =>
      name.endsWith(".mdx"),
    )) {
      const out = mdxToMarkdown(readFileSync(path.join(dir, file), "utf8"));
      const outsideCode = out.replace(/```[\s\S]*?```/g, "");

      expect(outsideCode, file).not.toMatch(
        /<\/?(CodeGroup|Card|CardGroup|Note|Info|Tip|Warning|Check|Steps|Step|Tabs|Tab)\b/,
      );
      expect(outsideCode, file).not.toMatch(/\{\/\*/);
    }
  });
});
