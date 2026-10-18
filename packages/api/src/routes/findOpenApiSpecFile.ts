import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walks up from a given directory to find the repository's bundled
 * OpenAPI spec, mirroring the .env resolution in
 * packages/shared/src/config/Config.ts so callers work identically
 * under tsx (src/) and the compiled build (dist/). Shared by
 * openapi.ts, openapi-json.ts, and documentation.ts, each of which
 * passes its own import.meta.url-derived directory as the starting
 * point.
 */
export function findOpenApiSpecFile(startDir: string): string {
  let current = startDir;

  while (true) {
    const candidate = join(current, "openapi", "openapi.bundled.yaml");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      throw new Error(
        "openapi/openapi.bundled.yaml not found in any parent directory. Run `npm run bundle:openapi`.",
      );
    }

    current = parent;
  }
}
