//
// Turns one docs/site/handbook/*.mdx page into plain Markdown for the
// handbook PDF (scripts/generate-handbook-pdf.ts). The site pages are the
// only copy of the handbook: the title lives in the frontmatter, and a
// few Mintlify components (cards, callouts) have no meaning in print.
//

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Components dropped entirely (navigation cards): whole card groups
// first, then any card left on its own.
const CARD_GROUP = /<CardGroup\b[\s\S]*?<\/CardGroup>/g;
const CARD = /<Card\b[\s\S]*?(\/>|<\/Card>)/g;

// Callout wrappers whose inner text is kept.
const CALLOUT_TAG = /^\s*<\/?(Info|Note|Tip|Warning|Check)\b[^>]*>\s*$/gm;

export function mdxToMarkdown(mdx: string): string {
  const frontmatter = FRONTMATTER.exec(mdx);
  const body = frontmatter ? mdx.slice(frontmatter[0].length) : mdx;

  const title = frontmatter?.[1]
    ?.split(/\r?\n/)
    .map((line) => /^title:\s*"?(.*?)"?\s*$/.exec(line)?.[1])
    .find((value) => value !== undefined);

  const cleaned = body
    .replace(CARD_GROUP, "")
    .replace(CARD, "")
    .replace(CALLOUT_TAG, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return title ? `# ${title}\n\n${cleaned}\n` : `${cleaned}\n`;
}
