#!/usr/bin/env node
// Builds the developer portal website at docs/portal/ from the Markdown pages in docs/developer-portal/.
//
// The site follows the layout of a developer documentation site: grouped navigation on the left, the
// article in the centre with a breadcrumb and previous/next links, an "On this page" contents list on
// the right, client-side search, copy buttons on code blocks, and light and dark themes. It has no
// build-time dependency beyond `marked`, which the repository already depends on, and no client-side
// dependency: every script and stylesheet is in the output folder.
//
// Usage (from the repository root):
//   node docs/developer-portal/tools/build-portal.mjs
//
// Exits 1 if an internal link points to a file that does not exist. A link to a missing #anchor is
// reported and does not fail the run. Generated files are written to docs/portal/, which GitHub Pages
// publishes from the docs folder.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const portalDir = resolve(here, "..");
const outDir = resolve(repo, "docs", "portal");
// Where the portal is published. Absolute links in the discovery files use this.
const siteBase = "https://pavancharak.github.io/parmana-core/portal/";
const repoUrl = "https://github.com/pavancharak/parmana-core";
const branch = "main";
const PORTAL_IN_REPO = "docs/developer-portal";

// The navigation. Every Markdown page in the portal must appear here or it is listed under "More".
const NAV = [
  {
    group: "Get started",
    pages: ["README.md", "overview.md", "getting-started.md", "faq.md"],
  },
  {
    group: "Concepts",
    pages: [
      "architecture.md",
      "glossary.md",
      "policies/README.md",
      "security/README.md",
      "security/evidence-verification.md",
      "security/schema-v3.md",
    ],
  },
  {
    group: "Tutorials",
    pages: [
      "tutorials/README.md",
      "tutorials/maker-checker.md",
      "tutorials/transaction-limits.md",
      "tutorials/refund-authorization.md",
      "tutorials/nodejs-integration.md",
      "tutorials/python-integration.md",
      "tutorials/ai-agents.md",
      "tutorials/fintech-integration.md",
      "examples/README.md",
    ],
  },
  {
    group: "API reference",
    pages: ["api/README.md", "api/endpoints.md", "api/endpoint-index.md"],
  },
  {
    group: "SDKs and packages",
    pages: [
      "sdk/README.md",
      "sdk/typescript.md",
      "sdk/python.md",
      "sdk/cli.md",
      "sdk/verifier.md",
      "sdk/connector-sdk.md",
      "sdk/typescript-method-index.md",
      "sdk/python-method-index.md",
      "packages/envelope-verifier-api.md",
      "packages/execution-system-api.md",
      "packages/publishing-envelope-verifier-and-execution-system.md",
    ],
  },
  {
    group: "Operate",
    pages: [
      "deployment/README.md",
      "reference/README.md",
      "reference/environment-variables.md",
      "reference/error-codes.md",
      "reference/error-code-index.md",
      "troubleshooting/README.md",
    ],
  },
  {
    group: "Project",
    pages: ["CHANGELOG.md", "COVERAGE.md", "FINDINGS.md"],
  },
];

// ---------------------------------------------------------------------------
// Helpers

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

// A heading id in the style GitHub uses: lowercase, punctuation removed, spaces become hyphens.
function slugOf(text) {
  return text
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-"); // one hyphen per space, as GitHub does: "a → b" becomes "a--b"
}

function uniqueId(base, seen) {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

// Walk a directory and return the Markdown pages as portal-relative posix paths.
function listMarkdown(dir, prefix = "") {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "tools") continue;
      found.push(...listMarkdown(join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md")) {
      found.push(rel);
    }
  }
  return found.sort();
}

// The output path for a page: README.md becomes index.html in its folder.
function outPathFor(src) {
  let base = src.slice(0, -3);
  if (base === "README") base = "index";
  else if (base.endsWith("/README"))
    base = `${base.slice(0, -"/README".length)}/index`;
  return `${base}.html`;
}

// ---------------------------------------------------------------------------
// Collect pages

const allMarkdown = listMarkdown(portalDir);
const navPages = NAV.flatMap((g) => g.pages);
const unlisted = allMarkdown.filter((p) => !navPages.includes(p));
const missingFromDisk = navPages.filter((p) => !allMarkdown.includes(p));
if (missingFromDisk.length > 0) {
  console.error(
    `build-portal: navigation names pages that do not exist: ${missingFromDisk.join(", ")}`,
  );
  process.exit(1);
}
const navGroups = [...NAV];
if (unlisted.length > 0) {
  console.warn(
    `build-portal: pages not in the navigation, listed under "More": ${unlisted.join(", ")}`,
  );
  navGroups.push({ group: "More", pages: unlisted });
}

const flatOrder = navGroups.flatMap((g) =>
  g.pages.map((p) => ({ src: p, group: g.group })),
);
const pageSet = new Set(allMarkdown);

// ---------------------------------------------------------------------------
// Link rewriting

const brokenLinks = [];
const anchorChecks = []; // { from, href, targetOut, id }

function rewriteHref(href, src, fromOut) {
  if (/^(https?:|mailto:|\/\/)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  const [pathPart, hashPart] = href.split("#");
  const hash = hashPart !== undefined ? `#${hashPart}` : "";
  const resolved = posix.normalize(posix.join(posix.dirname(src), pathPart));

  // Outside the portal: link to the file on GitHub.
  if (resolved.startsWith("..")) {
    const repoRel = posix.normalize(posix.join(PORTAL_IN_REPO, resolved));
    const abs = resolve(repo, repoRel);
    const isDir = existsSync(abs) && statSync(abs).isDirectory();
    if (!existsSync(abs)) brokenLinks.push({ from: src, href });
    return `${repoUrl}/${isDir ? "tree" : "blob"}/${branch}/${repoRel}${hash}`;
  }

  if (pageSet.has(resolved)) {
    const target = outPathFor(resolved);
    const rel = posix.relative(posix.dirname(fromOut), target);
    anchorChecks.push({ from: src, href, target: resolved, id: hashPart });
    return `${rel}${hash}`;
  }

  const abs = join(portalDir, resolved);
  if (existsSync(abs) && statSync(abs).isFile()) {
    // A non-Markdown file inside the portal (for example an example script) is linked on GitHub.
    return `${repoUrl}/blob/${branch}/${PORTAL_IN_REPO}/${resolved}${hash}`;
  }
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    const index = join(resolved, "README.md");
    if (pageSet.has(index)) {
      const rel = posix.relative(posix.dirname(fromOut), outPathFor(index));
      return `${rel}${hash}`;
    }
    return `${repoUrl}/tree/${branch}/${PORTAL_IN_REPO}/${resolved}${hash}`;
  }
  brokenLinks.push({ from: src, href });
  return href;
}

// ---------------------------------------------------------------------------
// Render a page

function renderPage(src, text) {
  const headings = [];
  const seen = new Map();
  const fromOut = outPathFor(src);

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        // `text` is the heading's content without the leading hash marks; `raw` includes them.
        const inner = this.parser.parseInline(tokens);
        const id = uniqueId(slugOf(text), seen);
        headings.push({ depth, id, text: text.replace(/`/g, "") });
        return `<h${depth} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const body = this.parser.parseInline(tokens);
        const target = rewriteHref(href, src, fromOut);
        const external =
          /^https?:/i.test(target) && !target.startsWith(repoUrl);
        const attrs = [
          `href="${escapeAttr(target)}"`,
          title ? `title="${escapeAttr(title)}"` : "",
          external ? 'rel="noopener" target="_blank"' : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<a ${attrs}>${body}</a>`;
      },
      code({ text: code, lang }) {
        const label = (lang || "text").split(/\s+/)[0];
        return (
          `<div class="code">` +
          `<div class="code-bar"><span>${escapeHtml(label)}</span>` +
          `<button type="button" class="copy" aria-label="Copy code">Copy</button></div>` +
          `<pre><code class="language-${escapeAttr(label)}">${escapeHtml(code)}</code></pre>` +
          `</div>\n`
        );
      },
    },
  });

  let html = marked.parse(text);
  html = html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");

  const h1 = headings.find((h) => h.depth === 1);
  const title = h1 ? h1.text : src.replace(/\.md$/, "");
  // A plain-text excerpt for search: drop code, links and Markdown punctuation.
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // The first real sentence of prose: skip headings, lists, tables, quotes, code and navigation links.
  const prose = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .find((b) => b.length > 40 && !/^(#|\[|>|-|\*|\d+\.|\||```|<)/.test(b));
  const summary = (prose ?? plain)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return {
    src,
    title,
    headings,
    html,
    excerpt: plain.slice(0, 240),
    summary,
    outRel: fromOut,
  };
}

const rendered = new Map();
for (const src of allMarkdown) {
  const text = readFileSync(join(portalDir, src), "utf8");
  rendered.set(src, renderPage(src, text));
}

// Check anchors after every page is rendered, so a link to a later page is checked too.
const anchorProblems = [];
for (const check of anchorChecks) {
  if (!check.id) continue;
  const target = rendered.get(check.target);
  if (!target) continue;
  if (!target.headings.some((h) => h.id === check.id)) {
    anchorProblems.push(`${check.from} -> ${check.href}`);
  }
}

if (brokenLinks.length > 0) {
  console.error("build-portal: broken links:");
  for (const b of brokenLinks) console.error(`  ${b.from}: ${b.href}`);
  process.exit(1);
}
if (anchorProblems.length > 0) {
  console.warn(
    `build-portal: ${anchorProblems.length} link(s) name a #section that is not a heading in the target:`,
  );
  for (const p of anchorProblems) console.warn(`  ${p}`);
}

// ---------------------------------------------------------------------------
// Page chrome

const CSS = readFileSync(join(here, "portal-assets", "portal.css"), "utf8");
const JS = readFileSync(join(here, "portal-assets", "portal.js"), "utf8");

function navHtml(currentSrc) {
  return navGroups
    .map((g) => {
      const items = g.pages
        .map((p) => {
          const page = rendered.get(p);
          const href =
            posix.relative(
              posix.dirname(outPathFor(currentSrc)),
              outPathFor(p),
            ) || "index.html";
          const active = p === currentSrc ? ' aria-current="page"' : "";
          return `<li><a href="${href}"${active}>${escapeHtml(page.title)}</a></li>`;
        })
        .join("");
      return `<div class="nav-group"><div class="nav-title">${escapeHtml(g.group)}</div><ul>${items}</ul></div>`;
    })
    .join("\n");
}

function tocHtml(page) {
  const items = page.headings.filter((h) => h.depth === 2 || h.depth === 3);
  if (items.length === 0) return "";
  const list = items
    .map(
      (h) =>
        `<li class="d${h.depth}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
    )
    .join("");
  return `<nav class="toc" aria-label="On this page"><div class="toc-title">On this page</div><ul>${list}</ul></nav>`;
}

function prevNext(src) {
  const i = flatOrder.findIndex((p) => p.src === src);
  const from = posix.dirname(outPathFor(src));
  const link = (p) => posix.relative(from, outPathFor(p.src));
  const prev = i > 0 ? flatOrder[i - 1] : null;
  const next = i < flatOrder.length - 1 ? flatOrder[i + 1] : null;
  const cell = (p, dir) =>
    p
      ? `<a class="pn ${dir}" href="${link(p)}"><span>${dir === "prev" ? "Previous" : "Next"}</span>${escapeHtml(rendered.get(p.src).title)}</a>`
      : `<span class="pn ${dir} empty"></span>`;
  return `<nav class="pager" aria-label="Pager">${cell(prev, "prev")}${cell(next, "next")}</nav>`;
}

function layout(page) {
  const root = posix.relative(posix.dirname(page.outRel), ".") || ".";
  const rootPrefix = root === "." ? "" : `${root}/`;
  const group = flatOrder.find((p) => p.src === page.src)?.group ?? "";
  const crumb = `<div class="crumb"><span>${escapeHtml(group)}</span><span class="sep">/</span><span>${escapeHtml(page.title)}</span></div>`;
  const editUrl = `${repoUrl}/edit/${branch}/${PORTAL_IN_REPO}/${page.src}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} · Parmana developer docs</title>
<meta name="description" content="${escapeAttr(page.excerpt)}">
<link rel="icon" href="${rootPrefix}logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="${rootPrefix}portal.css">
</head>
<body>
<header class="topbar">
  <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false">Menu</button>
  <a class="brand" href="${posix.relative(posix.dirname(page.outRel), "index.html") || "index.html"}">
    <span class="mark" aria-hidden="true"></span>
    <span>Parmana <em>developer docs</em></span>
  </a>
  <div class="search">
    <input id="search" type="search" placeholder="Search the docs" autocomplete="off" aria-label="Search the docs">
    <kbd aria-hidden="true">/</kbd>
    <div id="results" class="results" role="listbox" hidden></div>
  </div>
  <nav class="top-links">
    <a href="${repoUrl}" rel="noopener" target="_blank">GitHub</a>
    <a class="btn" href="${posix.relative(posix.dirname(page.outRel), "getting-started.html") || "getting-started.html"}">Get started</a>
  </nav>
</header>
<div class="shell">
  <aside class="sidebar" id="sidebar" aria-label="Documentation navigation">
${navHtml(page.src)}
  </aside>
  <main class="content">
    ${crumb}
    <article>
${page.html}
    </article>
    <div class="meta"><a href="${editUrl}" rel="noopener" target="_blank">Edit this page on GitHub</a></div>
    ${prevNext(page.src)}
    <footer class="foot">Generated from docs/developer-portal. Verified against the repository at the time of writing; see the Project section for coverage and open findings.</footer>
  </main>
  ${tocHtml(page)}
</div>
<script>window.PORTAL_ROOT = ${JSON.stringify(rootPrefix)};</script>
<script src="${rootPrefix}search-index.js"></script>
<script src="${rootPrefix}portal.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Write the site

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const page of rendered.values()) {
  const file = join(outDir, page.outRel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, layout(page));
}

writeFileSync(join(outDir, "portal.css"), CSS);
writeFileSync(join(outDir, "portal.js"), JS);
writeFileSync(
  join(outDir, "logo.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f46e5"/><path d="M9 22V10h7a4 4 0 0 1 0 8h-3v4z" fill="#fff"/></svg>\n`,
);

const index = flatOrder.map((p) => {
  const page = rendered.get(p.src);
  return {
    t: page.title,
    p: page.outRel,
    g: p.group,
    h: page.headings
      .filter((h) => h.depth === 2 || h.depth === 3)
      .map((h) => h.text),
    x: page.excerpt,
  };
});
writeFileSync(
  join(outDir, "search-index.js"),
  `/* global window */\nwindow.PORTAL_INDEX = ${JSON.stringify(index)};\n`,
);

// ---------------------------------------------------------------------------
// Discovery files for crawlers and AI agents.
//   docs/portal/sitemap.xml   every page, for search engines
//   docs/portal/llms.txt      an index of the pages, with a one-line summary each
//   docs/portal/llms-full.txt the full text of every page, in reading order
//   docs/robots.txt           allows crawling and points to the sitemap (site root)

const absolute = (outRel) => siteBase + outRel;

writeFileSync(
  join(outDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    flatOrder
      .map(
        (p) =>
          `  <url><loc>${escapeHtml(absolute(rendered.get(p.src).outRel))}</loc></url>`,
      )
      .join("\n") +
    `\n</urlset>\n`,
);

const llmsLines = [
  "# Parmana developer docs",
  "",
  "> Parmana sets clear limits on what AI agents and business systems may do, checks every action against those limits, and records each decision as a verifiable Execution Trust Record. These pages document the API, the SDKs, the policy model and the operations.",
  "",
  "The API is described by an OpenAPI document at https://pavancharak.github.io/parmana-core/site/openapi.bundled.yaml. Experimental Policy version 2 operations are marked as such in that document.",
];
for (const g of navGroups) {
  llmsLines.push("", `## ${g.group}`, "");
  for (const src of g.pages) {
    const page = rendered.get(src);
    llmsLines.push(
      `- [${page.title}](${absolute(page.outRel)}): ${page.summary}`,
    );
  }
}
writeFileSync(join(outDir, "llms.txt"), llmsLines.join("\n") + "\n");

const fullParts = [
  "# Parmana developer docs: full text",
  "",
  "Every page of the developer portal, in reading order. Source: docs/developer-portal/ in https://github.com/pavancharak/parmana-core.",
];
for (const p of flatOrder) {
  const page = rendered.get(p.src);
  const text = readFileSync(join(portalDir, p.src), "utf8").trimEnd();
  fullParts.push(
    "",
    "---",
    "",
    `Page: ${absolute(page.outRel)}`,
    `Source: docs/developer-portal/${p.src}`,
    "",
    text,
  );
}
writeFileSync(join(outDir, "llms-full.txt"), fullParts.join("\n") + "\n");

writeFileSync(
  resolve(repo, "docs", "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteBase}sitemap.xml\n`,
);

const sep2 = sep;
console.log(
  `build-portal: wrote ${rendered.size} pages to ${relative(repo, outDir).split(sep2).join("/")}/ (${navPages.length} in navigation).`,
);
