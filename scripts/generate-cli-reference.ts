import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

import { renderReference } from "../packages/cli/src/reference.js";

/** Writes docs/site/cli/reference.mdx from the CLI command table, formatted as the repository formats it. */
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "docs", "site", "cli", "reference.mdx");
const options = (await resolveConfig(target)) ?? {};
writeFileSync(
  target,
  await format(renderReference(), { ...options, filepath: target }),
  "utf8",
);
console.log(`Wrote ${target}`);
