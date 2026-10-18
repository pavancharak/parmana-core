import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");

/**
 * redocly bundle carries each source JSON Schema file's own top-level
 * $id/$schema straight into components.schemas.<name> unchanged. Under
 * OAS 3.1 / JSON Schema 2020-12, a $id on a schema establishes a new
 * base URI for resolving $refs found within (or pointing at) that
 * schema, so a strict resolver — Swagger UI's, in this case, though not
 * redocly's own lint — rebases every #/components/schemas/... pointer
 * inside (or targeting) an $id-bearing schema against that schema's
 * https://schemas.parmanasystems.com/... $id instead of the bundle's own root,
 * and fails to resolve it ("Invalid object key 'components' at position
 * 0"). The source schema files under schemas/ keep their $id/$schema —
 * they're valid, independently-resolvable JSON Schema documents on
 * their own. Only this bundled OAS document, where every schema lives
 * under one shared #/components/schemas root, needs them gone.
 */
const bundlePath = path.join(root, "openapi", "openapi.bundled.yaml");

const bundle = parse(readFileSync(bundlePath, "utf8")) as {
  components?: { schemas?: Record<string, Record<string, unknown>> };
};

const schemas = bundle.components?.schemas;

if (!schemas) {
  throw new Error(
    `strip-openapi-schema-ids: ${bundlePath} has no components.schemas — ` +
      "nothing to strip. Has the bundle format changed?",
  );
}

let stripped = 0;

for (const schema of Object.values(schemas)) {
  if ("$id" in schema) {
    delete schema.$id;
    stripped++;
  }

  if ("$schema" in schema) {
    delete schema.$schema;
    stripped++;
  }
}

writeFileSync(bundlePath, stringify(bundle), "utf8");

console.log(
  `strip-openapi-schema-ids: removed ${stripped} $id/$schema key(s) from ` +
    `components.schemas in ${bundlePath}`,
);
