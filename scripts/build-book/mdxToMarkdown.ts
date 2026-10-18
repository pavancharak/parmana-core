//
// Turns one docs/site/build-book/*.mdx page into plain Markdown for the
// book PDF (scripts/generate-build-book-pdf.ts). It does what the
// handbook's converter does (title from the frontmatter, cards dropped,
// callout wrappers removed), and also what the book's pages need beyond
// it: MDX comments and <CodeGroup> wrappers removed, the tab title after
// a code fence's language dropped, and links into the docs site made
// absolute, so they still work on paper.
//

import { mdxToMarkdown as handbookMdxToMarkdown } from "../handbook/mdxToMarkdown.js";

export const DOCS_SITE_URL = "https://docs.parmanasystems.com";

const MDX_COMMENT = /\{\/\*[\s\S]*?\*\/\}\s*/g;
const CODE_GROUP_TAG = /^\s*<\/?CodeGroup\b[^>]*>\s*$/gm;

// ```typescript TypeScript  ->  ```typescript
const FENCE_WITH_TITLE = /^(\s*```[\w-]+)[ \t]+[^\n`]+$/gm;

// ](/build-book/x)  ->  ](https://docs.parmanasystems.com/build-book/x)
const SITE_LINK = /\]\((\/[^)\s]*)\)/g;

export function mdxToMarkdown(mdx: string): string {
  const withoutComponents = mdx
    .replace(MDX_COMMENT, "")
    .replace(CODE_GROUP_TAG, "")
    .replace(FENCE_WITH_TITLE, "$1");

  return handbookMdxToMarkdown(withoutComponents).replace(
    SITE_LINK,
    (_match, sitePath: string) => `](${DOCS_SITE_URL}${sitePath})`,
  );
}
