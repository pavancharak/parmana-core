import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { AuthorizationRevocationList } from "@parmana/execution-gateway";
import { loadConfig } from "@parmana/shared";

/**
 * Revoked authorizations, read from `<PARMANA_KEY_DIR>/revoked-authorizations.json`
 * on every check, so an operator change takes effect at the next release with
 * no restart. The file is a JSON array of authorization ids, or an object with an
 * `ids` array. A missing file means nothing is revoked. An unreadable or malformed
 * file throws, which refuses the release (fail closed).
 */
export function createAuthorizationRevocationList(): AuthorizationRevocationList {
  return {
    async isRevoked(authorizationId: string): Promise<boolean> {
      const directory = loadConfig().keys.keyDirectory;

      if (directory === undefined) {
        throw new Error("PARMANA_KEY_DIR is not configured; cannot read the revocation list.");
      }

      const path = join(directory, "revoked-authorizations.json");

      if (!existsSync(path)) {
        return false;
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        throw new Error(`${path} is not readable JSON: ${(error as Error).message}`, { cause: error });
      }

      const ids = Array.isArray(parsed)
        ? parsed
        : (parsed as { ids?: unknown })?.ids;

      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
        throw new Error(`${path} must be a JSON array of authorization ids, or { "ids": [...] }.`);
      }

      return ids.includes(authorizationId);
    },
  };
}
