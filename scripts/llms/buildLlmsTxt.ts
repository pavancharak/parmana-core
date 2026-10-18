import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds docs/site/llms.txt and docs/site/llms-full.txt from the docs
 * navigation, each page's own frontmatter, and the SDK package versions, so
 * neither file can drift from the docs. Deterministic: no timestamps, and
 * ordering follows docs.json.
 *
 * The CLI (scripts/generate-llms-txt.ts) writes the files. The test in
 * tests/architecture/llms-txt-up-to-date.test.ts fails when the committed files
 * differ from this output.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const docsRoot = join(repoRoot, "docs", "site");

const SITE = "https://docs.parmanasystems.com";

interface NavGroup {
  group: string;
  pages: Array<string | NavGroup>;
}

interface NavTab {
  tab: string;
  groups: NavGroup[];
}

interface PageEntry {
  readonly path: string;
  readonly tab: string;
  /** The top level navigation group. Nested groups inherit it. */
  readonly group: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
}

/** Groups whose pages are generated API reference or book length material. */
const REFERENCE_GROUPS = new Set(["API reference", "The Parmana Handbook"]);

/**
 * The pages included in full in llms-full.txt: the integration surface an
 * agent or developer needs to integrate and deploy. Curated and explicit so the
 * file stays a size an agent can actually read. Every path must exist in the
 * navigation, which the generator checks.
 */
const FULL_TEXT_PAGES = [
  "index",
  "choose-your-path",
  "agents/integrate",
  "agents/deploy",
  "quickstart",
  "build-book/overview",
  "guides/full-integration-overview",
  "guides/authorize-and-execute",
  "concepts/human-approval",
  "guides/connect-an-agent",
  "guides/connect-any-external-system",
  "integrations/connector-development-guide",
  "guides/write-your-first-policy",
  "guides/policy-lifecycle-and-approvals",
  "guides/manage-approvers",
  "guides/approval-notifications",
  "api-reference/introduction",
  "api-reference/authentication",
  "api-reference/error-handling",
  "api-reference/idempotency-and-nonces",
  "api-reference/error-catalog",
  "build-book/09-errors-and-troubleshooting",
  "sdks/typescript",
  "sdks/typescript-configuration",
  "guides/typescript-sdk-quickstart",
  "sdks/python",
  "sdks/python-configuration",
  "guides/python-sdk-quickstart",
  "deployment/local",
  "deployment/production",
  "deployment/aws-kms-signing",
  "deployment/environment-variables",
  "security/overview",
  "troubleshooting",
] as const;

function frontmatterValue(source: string, key: string): string {
  const match = source.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"));
  return match?.[1]?.replace(/\\"/g, '"') ?? "";
}

function stripFrontmatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trimStart();
}

function walk(
  pages: Array<string | NavGroup>,
  tab: string,
  group: string,
  out: PageEntry[],
): void {
  for (const page of pages) {
    if (typeof page !== "string") {
      // Nested groups (for example the typedoc Classes and Interfaces groups)
      // keep the top level group name.
      walk(page.pages, tab, group, out);
      continue;
    }

    const file = join(docsRoot, `${page}.mdx`);
    const alt = join(docsRoot, `${page}.md`);
    const source = readFileSync(existsSync(file) ? file : alt, "utf8");

    out.push({
      path: page,
      tab,
      group,
      title: frontmatterValue(source, "title") || page,
      description: frontmatterValue(source, "description"),
      body: stripFrontmatter(source).replace(/\r\n/g, "\n"),
    });
  }
}

function loadPages(): PageEntry[] {
  const docs = JSON.parse(
    readFileSync(join(docsRoot, "docs.json"), "utf8"),
  ) as { navigation: { tabs: NavTab[] } };

  const out: PageEntry[] = [];

  for (const tab of docs.navigation.tabs) {
    for (const group of tab.groups) {
      walk(group.pages, tab.tab, group.group, out);
    }
  }

  return out;
}

function url(path: string): string {
  return path === "index" ? SITE : `${SITE}/${path}`;
}

function sdkVersions(): { typescript: string; python: string } {
  const typescript = (
    JSON.parse(
      readFileSync(join(repoRoot, "typescript", "package.json"), "utf8"),
    ) as { version: string }
  ).version;

  const pyproject = readFileSync(
    join(repoRoot, "python", "pyproject.toml"),
    "utf8",
  );
  const python = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown";

  return { typescript, python };
}

const SUMMARY =
  "Parmana is an authorization layer between a caller (an AI agent, a script or a person) and the business systems " +
  "that carry out an action. The caller sends a Business Transaction that describes the intended action. A policy " +
  "engine decides. If the action is approved, Parmana signs an authorization, releases the action to the connector, " +
  "and returns a signed Execution Trust Record that anyone can verify without trusting Parmana. The caller never " +
  "holds the credentials for the target system.";

export function buildLlmsTxt(): string {
  const pages = loadPages();
  const versions = sdkVersions();
  const lines: string[] = [];

  lines.push("# Parmana", "", `> ${SUMMARY}`, "");

  lines.push(
    "This file is generated from the documentation navigation. Do not edit it by hand. Regenerate it with `npm run generate:llms-txt`.",
    "",
    "## Facts to rely on",
    "",
    `* Documentation: ${SITE}`,
    "* There is no fixed public API base URL. Every deployment has its own, so ask the operator for it.",
    "* Authentication: every request carries `Authorization: Bearer <key>`. The operator issues the key.",
    "* On any running server, the machine readable API description is at `/openapi.json`, `/openapi.yaml` and `/api-manifest.json`.",
    `* TypeScript SDK: \`@parmana/sdk\` ${versions.typescript} on npm.`,
    `* Python SDK: \`parmana\` ${versions.python} on PyPI.`,
    `* If you are an AI agent, start with ${url("agents/integrate")} and follow it exactly.`,
    `* For the integration pages concatenated into one document, read ${url("llms-full.txt")}.`,
    "",
  );

  let currentHeading = "";

  for (const page of pages) {
    if (REFERENCE_GROUPS.has(page.group)) continue;

    const heading = `${page.tab}: ${page.group}`;

    if (heading !== currentHeading) {
      lines.push(`## ${heading}`, "");
      currentHeading = heading;
    }

    const description = page.description ? `: ${page.description}` : "";
    lines.push(`* [${page.title}](${url(page.path)})${description}`);
  }

  lines.push(
    "",
    "## Generated reference",
    "",
    `* TypeScript SDK API reference: ${url("sdks/reference/typescript/classes/ParmanaClient")}`,
    `* Python SDK API reference: ${url("sdks/reference/python/client")}`,
    `* The Parmana Handbook (book length, 23 chapters): ${url("handbook/overview")}`,
    "",
  );

  return `${lines.join("\n")}`;
}

export function buildLlmsFullTxt(): string {
  const all = loadPages();
  const byPath = new Map(all.map((page) => [page.path, page]));

  const pages = FULL_TEXT_PAGES.map((path) => {
    const page = byPath.get(path);

    if (page === undefined) {
      throw new Error(
        `llms-full.txt lists "${path}", which is not in docs.json. Fix FULL_TEXT_PAGES in scripts/llms/buildLlmsTxt.ts.`,
      );
    }

    return page;
  });

  const parts: string[] = [
    "# Parmana: integration documentation in full",
    "",
    `> ${SUMMARY}`,
    "",
    "This file concatenates the integration pages of the Parmana documentation. It is generated. Do not edit it by hand. Regenerate it with `npm run generate:llms-txt`. The index of every page is at " +
      `${url("llms.txt")}.`,
    "",
  ];

  for (const page of pages) {
    parts.push(
      "---",
      "",
      `## ${page.title}`,
      "",
      `Source: ${url(page.path)}`,
      "",
      page.body.trimEnd(),
      "",
    );
  }

  return parts.join("\n");
}
