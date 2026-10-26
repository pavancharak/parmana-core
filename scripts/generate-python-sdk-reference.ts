import { escapeMdxUnsafeCharacters } from "./python-sdk-reference/escapeMdx.js";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const STAGING_DIR = path.join(root, ".typedoc-staging", "python");
const DOCS_DIR = path.join(root, "docs", "site", "sdks", "reference", "python");
const NAV_BASE = "sdks/reference/python";
const DOCS_JSON_PATH = path.join(root, "docs", "site", "docs.json");
const PYDOC_MARKDOWN_CONFIG = path.join(root, "pydoc-markdown.python.yml");
// pydoc-markdown does not write a page description, so each page's description
// is kept here, keyed by its path under DOCS_DIR without the .mdx extension.
const DESCRIPTIONS_PATH = path.join(
  root,
  "scripts",
  "python-sdk-reference",
  "descriptions.json",
);
const descriptions: Record<string, string> = JSON.parse(
  readFileSync(DESCRIPTIONS_PATH, "utf8"),
);

async function run(): Promise<void> {
  console.log("generate-python-sdk-reference: running pydoc-markdown...");

  /**
   * Invoked as `python -m pydoc_markdown.main`, not the `pydoc-markdown`
   * console-script shim: the shim is a generated .exe/.cmd on Windows,
   * which (like npx) needs shell:true to resolve, and Node's own
   * execFileSync docs warn that combining shell:true with an args array
   * is an argument-injection risk. `python` itself needs no shell.
   */
  execFileSync("python", ["-m", "pydoc_markdown.main", PYDOC_MARKDOWN_CONFIG], {
    cwd: root,
    stdio: "inherit",
  });

  if (existsSync(DOCS_DIR)) {
    rmSync(DOCS_DIR, { recursive: true, force: true });
  }
  mkdirSync(DOCS_DIR, { recursive: true });

  const navPages = await walkAndTransform(
    path.join(STAGING_DIR, "parmana"),
    DOCS_DIR,
  );
  navPages.sort();

  await updateNav(navPages);

  console.log(
    `generate-python-sdk-reference: wrote ${navPages.length} pages to ${DOCS_DIR}`,
  );
}

/**
 * Adds the page's description to its frontmatter, just before the closing
 * `---`, from descriptions.json. A page with no entry is an error, so a new
 * page cannot be generated, or committed, without a description.
 */
function withDescription(body: string, key: string): string {
  if (/^description:/m.test(body.split("\n---\n")[0] ?? "")) return body;
  const description = descriptions[key];
  if (description === undefined) {
    throw new Error(
      `generate-python-sdk-reference: no description for ${key}; add it to descriptions.json.`,
    );
  }
  return body.replace(
    "\n---\n",
    `\ndescription: ${JSON.stringify(description)}\n---\n`,
  );
}

/**
 * pydoc-markdown's docusaurus renderer already mirrors the source
 * package's own directory structure (parmana/api/audit_api.md,
 * parmana/errors/http_error.md, ...) and already emits Mintlify-
 * compatible frontmatter (title, sidebar_label) directly -- unlike the
 * TypeScript pipeline, no breadcrumb block to strip and (verified
 * against the full staging output before writing this) no internal
 * cross-page markdown links to rewrite; the crossref processor
 * resolves type references in signatures as plain text, not links.
 * The one required fix: escape_html_in_docstring is left on the
 * renderer's own default in some configurations and HTML-escapes
 * docstring text (`&gt;&gt;&gt;`, `&quot;`) that Mintlify's MDX
 * pipeline would otherwise render literally, so this still runs a
 * defensive unescape pass in case that renderer setting drifts.
 * Docstring prose can also contain a bare `{word, word}` or `<word>`
 * (describing a JSON shape or a placeholder) outside any code fence --
 * both are meaningful MDX syntax (an expression, an unclosed tag) and
 * would break the build, so those are escaped line-by-line, skipping
 * lines inside triple-backtick fences where the exact same characters
 * are legitimate Python/JSON syntax Mintlify already renders literally.
 */
async function walkAndTransform(
  sourceDir: string,
  destDir: string,
  navPrefixParts: string[] = [],
): Promise<string[]> {
  const navPages: string[] = [];

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = path.join(sourceDir, entry);

    if (statSync(sourcePath).isDirectory()) {
      const nestedDest = path.join(destDir, entry);
      mkdirSync(nestedDest, { recursive: true });
      navPages.push(
        ...(await walkAndTransform(sourcePath, nestedDest, [
          ...navPrefixParts,
          entry,
        ])),
      );
      continue;
    }

    if (!entry.endsWith(".md")) continue;

    const raw = readFileSync(sourcePath, "utf8");
    const body = escapeMdxUnsafeCharacters(unescapeHtmlEntities(raw));

    const name = entry.replace(/\.md$/, "");
    const key = path
      .relative(DOCS_DIR, path.join(destDir, name))
      .split(path.sep)
      .join("/");
    // Prettier's markdown output is the committed format: it turns the
    // setext headings pydoc emits into `##` headings, and spaces lists.
    writeFileSync(
      path.join(destDir, `${name}.mdx`),
      await format(withDescription(body, key), { parser: "mdx" }),
      "utf8",
    );

    navPages.push([NAV_BASE, ...navPrefixParts, name].join("/"));
  }

  return navPages;
}

function unescapeHtmlEntities(text: string): string {
  return text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Replaces the pages of the "API reference" group in the "Python SDK" tab with
 * a freshly computed list. Idempotent, and mirrors
 * generate-typescript-sdk-reference.ts's updateNav. Every other group and tab
 * in docs.json is left untouched.
 *
 * The navigation used to have one "SDKs" group with a "Python SDK Reference"
 * sub group inside it. It was reorganized into one tab per SDK, and this
 * function follows that structure.
 */
async function updateNav(navPages: string[]): Promise<void> {
  const config = JSON.parse(readFileSync(DOCS_JSON_PATH, "utf8"));

  const tab = (
    config.navigation.tabs as {
      tab: string;
      groups?: { group: string; pages: unknown[] }[];
    }[]
  ).find((candidate) => candidate.tab === "Python SDK");

  const referenceGroup = tab?.groups?.find(
    (group) => group.group === "API reference",
  );

  if (!referenceGroup) {
    throw new Error(
      "generate-python-sdk-reference: the 'API reference' group in the 'Python SDK' tab was not found in docs.json",
    );
  }

  referenceGroup.pages = navPages;

  writeFileSync(
    DOCS_JSON_PATH,
    await format(JSON.stringify(config, null, 2), { parser: "json" }),
    "utf8",
  );
}

await run();
