import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const STAGING_DIR = path.join(root, ".typedoc-staging", "typescript");
const DOCS_DIR = path.join(
  root,
  "docs",
  "site",
  "sdks",
  "reference",
  "typescript",
);
const NAV_BASE = "sdks/reference/typescript";
const DOCS_JSON_PATH = path.join(root, "docs", "site", "docs.json");

/**
 * typedoc-plugin-markdown groups reflections into these directories.
 * Order here is the order they appear in the generated nav group.
 */
const CATEGORY_LABELS: Record<string, string> = {
  classes: "Classes",
  interfaces: "Interfaces",
  enumerations: "Enumerations",
  "type-aliases": "Type Aliases",
  functions: "Functions",
  variables: "Variables",
};

function run(): void {
  console.log("generate-typescript-sdk-reference: running typedoc...");

  /**
   * Invokes typedoc's own JS entry point directly with the current
   * Node binary rather than shelling out to `npx typedoc`: the latter
   * needs shell:true to resolve on Windows (a .cmd shim), which
   * Node's own execFileSync docs warn is an argument-injection risk
   * once shell:true and an args array are combined.
   */
  const typedocBin = path.join(
    root,
    "node_modules",
    "typedoc",
    "bin",
    "typedoc",
  );
  execFileSync(
    process.execPath,
    [typedocBin, "--options", path.join(root, "typedoc.typescript.json")],
    { cwd: root, stdio: "inherit" },
  );

  if (existsSync(DOCS_DIR)) {
    rmSync(DOCS_DIR, { recursive: true, force: true });
  }
  mkdirSync(DOCS_DIR, { recursive: true });

  const navByCategory: Record<string, string[]> = {};

  for (const category of Object.keys(CATEGORY_LABELS)) {
    const sourceDir = path.join(STAGING_DIR, category);
    if (!existsSync(sourceDir)) continue;

    const destDir = path.join(DOCS_DIR, category);
    mkdirSync(destDir, { recursive: true });

    const files = readdirSync(sourceDir).filter((f) => f.endsWith(".md"));
    const navPages: string[] = [];

    for (const file of files) {
      const name = file.replace(/\.md$/, "");
      const raw = readFileSync(path.join(sourceDir, file), "utf8");
      const { title, body } = transform(raw, category);

      const frontmatter = `---\ntitle: ${JSON.stringify(title)}\n---\n\n`;
      writeFileSync(
        path.join(destDir, `${name}.mdx`),
        frontmatter + body,
        "utf8",
      );
      navPages.push(`${NAV_BASE}/${category}/${name}`);
    }

    navPages.sort();
    navByCategory[category] = navPages;
  }

  updateNav(navByCategory);

  console.log(
    `generate-typescript-sdk-reference: wrote ${Object.values(navByCategory).flat().length} pages to ${DOCS_DIR}`,
  );
}

/**
 * typedoc-plugin-markdown emits a breadcrumb block
 * ("[**@parmana/sdk**](../README.md)\n\n***\n\n[...] / Name\n\n") before
 * the real "# Category: Name" heading -- Mintlify's own sidebar already
 * gives breadcrumb-equivalent context, and the relative ../README.md
 * link has nothing to resolve against once these files move under
 * docs/site. Strips that block, pulls the heading text out as the page
 * title (Mintlify renders its own <title>, a duplicate H1 in the body
 * is redundant), and rewrites every relative link to a sibling
 * generated page into an absolute Mintlify path. Three link shapes
 * appear in practice (surveyed across the full staging output before
 * writing this): "../interfaces/Configuration.md" (cross-category,
 * optionally with a "#anchor"), a bare "AuthenticationError.md"
 * (same-category, since typedoc-plugin-markdown omits "./" for
 * same-directory links), and "../README.md" (the module index this
 * script never generates a copy of, redirected to the hand-written
 * overview page instead).
 */
function transform(
  raw: string,
  currentCategory: string,
): { title: string; body: string } {
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length && !lines[i].startsWith("# ")) {
    i++;
  }

  if (i >= lines.length) {
    throw new Error(
      "generate-typescript-sdk-reference: no '# ' heading found in generated page",
    );
  }

  const title = lines[i].slice(2).trim();
  let body = lines
    .slice(i + 1)
    .join("\n")
    .replace(/^\n+/, "");

  body = body.replace(/\]\(\.\.\/README\.md\)/g, "](/sdks/typescript)");

  body = body.replace(
    /\]\(\.\.\/([a-z-]+)\/([^)#]+)\.md(#[^)]+)?\)/g,
    (_match, category: string, name: string, anchor = "") =>
      `](/${NAV_BASE}/${category}/${name}${anchor})`,
  );

  body = body.replace(
    /\]\(([^./)][^)#]*)\.md(#[^)]+)?\)/g,
    (_match, name: string, anchor = "") =>
      `](/${NAV_BASE}/${currentCategory}/${name}${anchor})`,
  );

  return { title, body };
}

/**
 * Replaces the pages of the "API reference" group in the "TypeScript SDK" tab
 * with a freshly computed set of sub groups (Classes, Interfaces and so on).
 * Idempotent, so re-running this script after the source changes never leaves
 * stale page entries behind. Every other group and tab in docs.json is left
 * untouched: this only ever rewrites the one group it owns.
 *
 * The navigation used to have one "SDKs" group with a "TypeScript SDK
 * Reference" sub group inside it. It was reorganized into one tab per SDK, and
 * this function follows that structure.
 */
function updateNav(navByCategory: Record<string, string[]>): void {
  const config = JSON.parse(readFileSync(DOCS_JSON_PATH, "utf8"));

  const tab = (
    config.navigation.tabs as {
      tab: string;
      groups?: { group: string; pages: unknown[] }[];
    }[]
  ).find((candidate) => candidate.tab === "TypeScript SDK");

  const referenceGroup = tab?.groups?.find(
    (group) => group.group === "API reference",
  );

  if (!referenceGroup) {
    throw new Error(
      "generate-typescript-sdk-reference: the 'API reference' group in the 'TypeScript SDK' tab was not found in docs.json",
    );
  }

  referenceGroup.pages = Object.entries(CATEGORY_LABELS)
    .filter(([category]) => (navByCategory[category] ?? []).length > 0)
    .map(([category, label]) => ({
      group: label,
      pages: navByCategory[category],
    }));

  writeFileSync(DOCS_JSON_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

run();
