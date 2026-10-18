import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLlmsFullTxt, buildLlmsTxt } from "./llms/buildLlmsTxt.js";

/**
 * Regenerates docs/site/llms.txt and docs/site/llms-full.txt.
 *
 * Usage: npm run generate:llms-txt
 */
const docsRoot = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "docs",
  "site",
);

const index = buildLlmsTxt();
const full = buildLlmsFullTxt();

writeFileSync(join(docsRoot, "llms.txt"), index);
writeFileSync(join(docsRoot, "llms-full.txt"), full);

console.log(
  `llms.txt: ${index.length} characters, llms-full.txt: ${full.length} characters`,
);
