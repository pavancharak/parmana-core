import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");

/**
 * Mintlify refuses to resolve an "openapi" path in docs.json outside
 * its content root (docs/site), so the bundled spec produced by
 * `npm run bundle:openapi` is copied here as a second, disposable
 * copy. openapi/openapi.bundled.yaml stays the source of truth.
 */
const source = path.join(root, "openapi", "openapi.bundled.yaml");
const destination = path.join(root, "docs", "site", "openapi.bundled.yaml");

copyFileSync(source, destination);

console.log(`copy-openapi-bundle-to-docs: copied ${source} -> ${destination}`);
