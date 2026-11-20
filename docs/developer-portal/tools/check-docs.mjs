#!/usr/bin/env node
// Checks the developer portal (docs/developer-portal) against the repository:
//
//   1. Links: every relative link resolves to a file, and every #anchor names a heading in its target.
//   2. Coverage: every public SDK method and every OpenAPI operation is mentioned in a narrative page
//      (not only in the generated index), so undocumented public functionality is reported.
//   3. Stale claims: phrases removed during review must not return.
//
// Usage (from the repository root):
//   node docs/developer-portal/tools/check-docs.mjs
// Exits 1 if a link is broken or a stale claim is found. Coverage gaps are reported, and do not fail the run.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const portal = resolve(here, "..");
const require = createRequire(join(repo, "package.json"));
const yaml = require("yaml");

const GENERATED = new Set([
  "sdk/typescript-method-index.md",
  "sdk/python-method-index.md",
  "api/endpoint-index.md",
  "reference/error-code-index.md",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

// GitHub-style heading slug.
const slug = (text) =>
  text
    .replace(/<[^>]+>/g, "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

const headingsOf = (file) => {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  const slugs = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+)$/gm)) slugs.add(slug(m[1]));
  return slugs;
};

const files = walk(portal);
const problems = [];
const headingCache = new Map();
const headingsFor = (f) => {
  if (!headingCache.has(f)) headingCache.set(f, headingsOf(f));
  return headingCache.get(f);
};

// 1. Links
let linkCount = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target) || target.startsWith("<")) {
      continue;
    }
    linkCount++;
    const [pathPart, anchor] = target.split("#");
    const resolved = pathPart ? resolve(dirname(file), pathPart) : file;
    if (!existsSync(resolved)) {
      problems.push(`${relative(repo, file)}: broken link -> ${target}`);
      continue;
    }
    if (
      anchor &&
      resolved.endsWith(".md") &&
      !headingsFor(resolved).has(anchor)
    ) {
      problems.push(`${relative(repo, file)}: missing anchor -> ${target}`);
    }
  }
  // same-page anchors
  for (const m of text.matchAll(/\]\(#([^)\s]+)\)/g)) {
    linkCount++;
    if (!headingsFor(file).has(m[1]))
      problems.push(
        `${relative(repo, file)}: missing same-page anchor -> #${m[1]}`,
      );
  }
}

// 2. Coverage: public methods and operations mentioned in narrative pages
const narrative = files.filter((f) => !GENERATED.has(relative(portal, f)));
const narrativeText = narrative.map((f) => readFileSync(f, "utf8")).join("\n");

const tsIndex = readFileSync(
  join(portal, "sdk/typescript-method-index.md"),
  "utf8",
);
const tsMethods = [...tsIndex.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]);
const pyIndex = readFileSync(
  join(portal, "sdk/python-method-index.md"),
  "utf8",
);
const pyMethods = [...pyIndex.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]);
const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const undocumentedTs = tsMethods.filter(
  (m) => !new RegExp(`\\b${m}\\b`).test(narrativeText),
);
const undocumentedPy = pyMethods.filter(
  (m) => !new RegExp(`\\b${m}\\b`).test(narrativeText),
);
const undocumentedPyCamel = pyMethods.filter(
  (m) => !narrativeText.includes(m) && !narrativeText.includes(toSnake(m)),
);

const spec = yaml.parse(
  readFileSync(join(repo, "openapi/openapi.yaml"), "utf8"),
);
const ops = [];
for (const [p, item] of Object.entries(spec.paths)) {
  for (const m of Object.keys(item))
    if (["get", "post", "put", "delete", "patch"].includes(m))
      ops.push({ method: m.toUpperCase(), path: p, opId: item[m].operationId });
}
// An operation counts as documented when its path appears in a narrative page (the endpoint index is generated and excluded).
const undocumentedOps = ops.filter((o) => {
  const base = o.path.replace(/\{[^}]+\}/g, "{").split("{")[0];
  return (
    !narrativeText.includes(o.path) &&
    !(base.length > 3 && narrativeText.includes(base))
  );
});

// 3. Stale claims removed during review
const STALE = [
  "This build produces",
  "The records this build produces",
  "approve-requires-approval",
  "The server records the nonce",
  "does not wait indefinitely",
  "It does not approve on the basis of the last answer",
  "Verified: after a server restart, the state",
  "Parmana does not change currency",
  "Do not reformat it, because a formatter",
];
const staleHits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const phrase of STALE)
    if (text.includes(phrase))
      staleHits.push(`${relative(repo, file)}: contains "${phrase}"`);
}

// Report
console.log(
  `files checked: ${files.length} (narrative: ${narrative.length}, generated: ${GENERATED.size})`,
);
console.log(`links checked: ${linkCount}`);
console.log(
  `SDK methods: TypeScript ${tsMethods.length}, Python ${pyMethods.length}`,
);
console.log(`OpenAPI operations: ${ops.length}`);
console.log("");
console.log(`Coverage (narrative pages):`);
console.log(
  `  TypeScript methods not named outside the index: ${undocumentedTs.length}${undocumentedTs.length ? ` -> ${undocumentedTs.join(", ")}` : ""}`,
);
console.log(
  `  Python methods not named outside the index:     ${undocumentedPy.length}${undocumentedPy.length ? ` -> ${undocumentedPy.join(", ")}` : ""}`,
);
console.log(
  `  OpenAPI operations whose path is not in a narrative page: ${undocumentedOps.length}`,
);
for (const o of undocumentedOps)
  console.log(`    ${o.method} ${o.path} (${o.opId})`);
console.log("");
if (problems.length) {
  console.log(`BROKEN (${problems.length}):`);
  for (const p of problems) console.log(`  ${p}`);
}
if (staleHits.length) {
  console.log(`STALE CLAIMS (${staleHits.length}):`);
  for (const h of staleHits) console.log(`  ${h}`);
}
if (!problems.length && !staleHits.length)
  console.log("links: all resolve. stale claims: none.");
void undocumentedPyCamel;
process.exit(problems.length || staleHits.length ? 1 : 0);
