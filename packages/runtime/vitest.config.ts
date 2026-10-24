import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { mergeConfig } from "vitest/config";

import rootConfig from "../../vitest.config.ts";

const here = dirname(fileURLToPath(import.meta.url));

// Run this package's tests with the repository's test setup (env, key
// fixtures) so `npm test` works from packages/runtime as well as the root.
export default mergeConfig(rootConfig, {
  root: here,
});
