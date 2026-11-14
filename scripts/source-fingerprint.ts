/**
 * A content fingerprint of a package's source, used to tell whether its
 * dist/ was built from the current source.
 *
 * Timestamps are not used. A git checkout, a copy (Stryker copies the repo
 * for each mutation run) or a CI cache can change file times without changing
 * any content, and a timestamp comparison then reports a fresh build as stale
 * or a stale build as fresh. Content does not change in those cases.
 *
 * The fingerprint covers every .ts file under src/, by path and content, in
 * sorted order, so renaming or deleting a file also changes it.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Name of the stamp file written into dist/ by write-dist-stamps.ts. */
export const SOURCE_STAMP_FILE = ".source-hash";

function sourceFiles(directory: string, relative = ""): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(path.join(directory, relative), {
    withFileTypes: true,
  })) {
    const entryRelative = path.join(relative, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(directory, entryRelative));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(entryRelative);
    }
  }

  return found;
}

/**
 * Returns the fingerprint of the .ts files under `srcDirectory`, or undefined
 * if the directory does not exist.
 */
export function sourceFingerprint(srcDirectory: string): string | undefined {
  try {
    statSync(srcDirectory);
  } catch {
    return undefined;
  }

  const hash = createHash("sha256");

  for (const relative of sourceFiles(srcDirectory).sort()) {
    // Path separators are normalised so the same tree hashes the same on
    // Windows and POSIX.
    hash.update(relative.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(path.join(srcDirectory, relative)));
    hash.update("\0");
  }

  return hash.digest("hex");
}
