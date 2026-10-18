import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

/**
 * Builds one documentation page per OpenAPI operation, and the navigation
 * groups that list them. Each page is a few lines of frontmatter. Mintlify
 * renders the endpoint (parameters, request body, responses, examples and an
 * interactive playground) from the bundled OpenAPI file, so the reference can
 * never disagree with the spec.
 *
 * The CLI (scripts/generate-endpoint-pages.ts) writes the files and updates
 * docs.json. tests/architecture/endpoint-pages-up-to-date.test.ts fails when
 * they differ from this output.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const ENDPOINTS_DIRECTORY = "docs/site/api-reference/endpoints";
export const OPENAPI_FILE_FOR_PAGES = "/openapi.bundled.yaml";
export const GUIDE_GROUP_NAME = "REST API guide";
export const REST_TAB_NAME = "REST API";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

interface OpenApiOperation {
  readonly operationId?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

interface OpenApiDocument {
  readonly tags?: ReadonlyArray<{ readonly name: string }>;
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
}

export interface EndpointPage {
  readonly slug: string;
  /** Path relative to docs/site, without extension, as used in docs.json. */
  readonly navPath: string;
  /** Path relative to the repository root. */
  readonly file: string;
  readonly group: string;
  readonly method: string;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly content: string;
}

export interface EndpointNavGroup {
  group: string;
  pages: string[];
}

function kebab(operationId: string): string {
  return operationId
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function firstSentence(description: string, fallback: string): string {
  const flat = description.replace(/\s+/g, " ").trim();

  if (flat === "") return fallback;

  const cut = flat.search(/\.(\s|$)/);
  const sentence = cut === -1 ? flat : flat.slice(0, cut + 1);

  return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
}

/**
 * Double quoted YAML with no escapes. A double quote inside the text becomes a
 * single quote and a backslash becomes a slash. That keeps the output stable
 * under Prettier, which rewrites a value that has both quote types into single
 * quoted YAML with doubled quotes, and the test compares the text byte for byte.
 */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "/").replace(/"/g, "'")}"`;
}

function loadSpec(): OpenApiDocument {
  return parse(
    readFileSync(join(repoRoot, "openapi", "openapi.bundled.yaml"), "utf8"),
  ) as OpenApiDocument;
}

export function buildEndpointPages(): EndpointPage[] {
  const spec = loadSpec();
  const tagOrder = (spec.tags ?? []).map((tag) => tag.name);
  const pages: EndpointPage[] = [];
  const seen = new Set<string>();

  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const operation = operations[method];

      if (operation?.operationId === undefined) continue;

      const slug = kebab(operation.operationId);

      if (seen.has(slug)) {
        throw new Error(`Two operations produce the page name "${slug}".`);
      }

      seen.add(slug);

      const title = operation.summary ?? operation.operationId;
      const description = firstSentence(operation.description ?? "", title);
      const group = operation.tags?.[0] ?? "Other";

      if (!tagOrder.includes(group)) tagOrder.push(group);

      const content =
        [
          "---",
          `title: ${quote(title)}`,
          `description: ${quote(description)}`,
          `openapi: ${quote(`${OPENAPI_FILE_FOR_PAGES} ${method.toUpperCase()} ${path}`)}`,
          "---",
        ].join("\n") + "\n";

      pages.push({
        slug,
        navPath: `api-reference/endpoints/${slug}`,
        file: `${ENDPOINTS_DIRECTORY}/${slug}.mdx`,
        group,
        method: method.toUpperCase(),
        path,
        title,
        description,
        content,
      });
    }
  }

  return pages.sort(
    (a, b) => tagOrder.indexOf(a.group) - tagOrder.indexOf(b.group),
  );
}

export function buildEndpointNavGroups(
  pages: readonly EndpointPage[],
): EndpointNavGroup[] {
  const groups: EndpointNavGroup[] = [];

  for (const page of pages) {
    let group = groups.find((entry) => entry.group === page.group);

    if (group === undefined) {
      group = { group: page.group, pages: [] };
      groups.push(group);
    }

    group.pages.push(page.navPath);
  }

  return groups;
}
