import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["**/test/**/*.test.ts", "**/tests/**/*.test.ts"],
    // .stryker-tmp: the repository copy npm run mutation works in.
    exclude: ["**/node_modules/**", "**/dist/**", ".stryker-tmp/**"],
    environment: "node",
    passWithNoTests: true,

    // Integration tests can take longer
    testTimeout: 30000,
    hookTimeout: 30000,

    setupFiles: [join(here, "vitest.setup.ts")],
  },
});
