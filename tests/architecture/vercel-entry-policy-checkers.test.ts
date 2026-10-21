import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * api/index.ts is the production entry on Vercel. It must pass the policy
 * change checker scope the same way server.ts does. Without it, every
 * approval of a policy change is refused with CHECKER_NOT_IN_SCOPE, because
 * the scope defaults to listing no one.
 */
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("policy change checkers are wired on every entry point", () => {
  it.each(["server.ts", "../../api/index.ts"])(
    "%s parses POLICY_CHANGE_CHECKERS and passes it to createApp",
    (file) => {
      const source = read(
        file === "server.ts"
          ? "packages/api/src/server.ts"
          : "api/index.ts",
      );

      expect(source).toMatch(/parsePolicyChangeCheckers\(\s*process\.env\.POLICY_CHANGE_CHECKERS,?\s*\)/);
      expect(source).toMatch(/policyChangeCheckers:\s*parsePolicyChangeCheckers/);
    },
  );
});
