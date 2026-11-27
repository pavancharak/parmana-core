// Counts, for each package, how many test files import the package's own
// src/ directly, and how many import the package by name (which resolves to
// dist/ through package.json "exports"). A mutant in src/ can only be killed
// by a test that reaches src/.
//
// Usage: node scripts/assurance-test-reach.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(root, "packages");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

console.log("package\ttest_files\tsrc_relative\tself_by_name");
for (const name of readdirSync(packagesDir).sort()) {
  const dir = path.join(packagesDir, name);
  if (!existsSync(path.join(dir, "src"))) continue;
  const files = [
    ...walk(path.join(dir, "tests")),
    ...walk(path.join(dir, "test")),
  ];
  let src = 0;
  let self = 0;
  const selfName = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  ).name;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    if (/from "(\.\.\/)+src\//.test(text)) src++;
    if (text.includes(`from "${selfName}"`)) self++;
  }
  console.log(`${name}\t${files.length}\t${src}\t${self}`);
}
