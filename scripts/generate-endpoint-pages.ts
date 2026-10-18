import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";

import {
  ENDPOINTS_DIRECTORY,
  GUIDE_GROUP_NAME,
  REST_TAB_NAME,
  buildEndpointNavGroups,
  buildEndpointPages,
  type EndpointNavGroup,
} from "./endpoints/buildEndpointPages.js";

/**
 * Regenerates docs/site/api-reference/endpoints/*.mdx from the bundled OpenAPI
 * file, and the endpoint groups of the REST API tab in docs/site/docs.json.
 *
 * Run `npm run openapi` first so the bundle is current, then:
 * Usage: npm run generate:endpoint-pages
 */
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

interface DocsNavGroup {
  group: string;
  pages: unknown[];
}

interface DocsTab {
  tab: string;
  groups: DocsNavGroup[];
}

const pages = buildEndpointPages();
const directory = join(repoRoot, ENDPOINTS_DIRECTORY);

mkdirSync(directory, { recursive: true });

const expected = new Set(pages.map((page) => `${page.slug}.mdx`));

for (const existing of readdirSync(directory)) {
  if (!expected.has(existing)) {
    rmSync(join(directory, existing));
  }
}

for (const page of pages) {
  writeFileSync(join(repoRoot, page.file), page.content);
}

const docsJsonPath = join(repoRoot, "docs", "site", "docs.json");
const docs = JSON.parse(readFileSync(docsJsonPath, "utf8")) as {
  navigation: { tabs: DocsTab[] };
};

const restTab = docs.navigation.tabs.find((tab) => tab.tab === REST_TAB_NAME);

if (restTab === undefined) {
  throw new Error(`docs.json has no "${REST_TAB_NAME}" tab.`);
}

const endpointGroupNames = new Set(
  buildEndpointNavGroups(pages).map((group) => group.group),
);

const guideGroup = restTab.groups.find(
  (group) =>
    group.group === GUIDE_GROUP_NAME ||
    group.group === REST_TAB_NAME ||
    !endpointGroupNames.has(group.group),
);

if (guideGroup === undefined) {
  throw new Error("docs.json REST API tab has no guide group to keep.");
}

const guide: EndpointNavGroup = {
  group: GUIDE_GROUP_NAME,
  pages: guideGroup.pages as string[],
};

restTab.groups = [guide, ...buildEndpointNavGroups(pages)];

writeFileSync(
  docsJsonPath,
  await format(JSON.stringify(docs, null, 2), { parser: "json" }),
);

console.log(
  `Wrote ${pages.length} endpoint pages in ${ENDPOINTS_DIRECTORY} and updated the ${REST_TAB_NAME} tab in docs.json.`,
);
