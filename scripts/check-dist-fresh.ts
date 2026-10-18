import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");

/**
 * Guards against the exact failure class behind the MUST-FIX-1 finding of an
 * earlier repository gap audit (in git history): workspace packages resolve each other through
 * package.json `exports` -> `dist/`, so a `dist/` compiled before
 * the last `src/` edit silently overrides current source for
 * every cross-package consumer, while a package's own tests
 * (importing `../src` directly) keep passing and hide it.
 *
 * This only detects staleness — it never rebuilds. Auto-fixing
 * here would just be a slower, quieter version of the same bug.
 */

/**
 * Newest mtime found anywhere under `dir`, or undefined if `dir`
 * doesn't exist or contains no files.
 */
function newestMtimeMs(dir: string): number | undefined {
  let newest: number | undefined;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const childNewest = newestMtimeMs(entryPath);
      if (
        childNewest !== undefined &&
        (newest === undefined || childNewest > newest)
      ) {
        newest = childNewest;
      }
      continue;
    }

    const mtimeMs = statSync(entryPath).mtimeMs;
    if (newest === undefined || mtimeMs > newest) {
      newest = mtimeMs;
    }
  }

  return newest;
}

const packagesDir = path.join(root, "packages");

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    // Only packages that publish compiled output other
    // workspace packages consume are in scope for this check.
    try {
      statSync(path.join(packagesDir, name, "src"));
      return true;
    } catch {
      return false;
    }
  });

const stale: { name: string; reason: string }[] = [];

for (const dirName of packageDirs) {
  const packageJsonPath = path.join(packagesDir, dirName, "package.json");

  let packageName = dirName;
  try {
    packageName = JSON.parse(readFileSync(packageJsonPath, "utf8")).name;
  } catch {
    // Fall back to the directory name if package.json is unreadable.
  }

  const srcNewest = newestMtimeMs(path.join(packagesDir, dirName, "src"));
  const distNewest = newestMtimeMs(path.join(packagesDir, dirName, "dist"));

  if (srcNewest === undefined) {
    continue;
  }

  if (distNewest === undefined) {
    stale.push({ name: packageName, reason: "dist/ is missing" });
    continue;
  }

  if (srcNewest > distNewest) {
    stale.push({ name: packageName, reason: "dist/ is older than src/" });
  }
}

if (stale.length > 0) {
  console.error("check-dist-fresh: stale build output detected.\n");
  for (const { name, reason } of stale) {
    console.error(
      `  dist/ is stale in ${name} (${reason}) — run npm run build.`,
    );
  }
  console.error(
    "\nTests import workspace packages through node_modules/@parmana/*, which " +
      "resolves to dist/, not src/. A stale dist/ silently runs old code — " +
      "rebuild before testing.",
  );
  process.exit(1);
}

console.log("check-dist-fresh: all workspace packages' dist/ are up to date.");
