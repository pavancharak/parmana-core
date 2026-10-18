import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";

import {
  BUILD_BOOK_DIRECTORY,
  buildReferenceChapters,
} from "./build-book/buildReference.js";

/**
 * Regenerates the reference chapters of "Build with Parmana"
 * (docs/site/build-book/reference-*.mdx) from the code.
 *
 * Run `npm run openapi` first so the bundle is current, then:
 * Usage: npm run generate:build-book-reference
 */
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

mkdirSync(join(repoRoot, BUILD_BOOK_DIRECTORY), { recursive: true });

for (const chapter of buildReferenceChapters()) {
  const path = join(repoRoot, chapter.file);
  writeFileSync(path, await format(chapter.content, { filepath: path }));
  console.log(`Wrote ${chapter.file}`);
}
