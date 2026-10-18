import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Mirrors packages/api/src/routes/openapi.ts's findSpecFile() — walks up
 * from this file to the repository's bundled OpenAPI spec, so it works
 * regardless of where in the tree this test file lives.
 */
function findBundledSpec(): string {
  let current = __dirname;

  while (true) {
    const candidate = join(current, "openapi", "openapi.bundled.yaml");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      throw new Error(
        "openapi/openapi.bundled.yaml not found in any parent directory.",
      );
    }

    current = parent;
  }
}

/**
 * A synthetic base URI standing in for "this bundle document, as
 * loaded" — the bundle itself declares no top-level $id, so it has no
 * real one. Any $ref that resolves to a different document than this
 * one, once $id-rebasing is taken into account, is exactly the
 * "Invalid object key 'components' at position 0" failure Swagger UI's
 * resolver raised.
 */
const DOCUMENT_BASE = "file:///openapi-bundle/openapi.bundled.yaml";

interface RefEscape {
  path: string;
  ref: string;
  resolvedAgainst: string;
  resolvedTo: string;
}

/**
 * Implements the one rule that actually causes this bug, directly from
 * spec (JSON Schema 2020-12 §8.2.1 / RFC 3986 URI resolution): a $id on
 * any (sub)schema establishes a new base URI for resolving every $ref
 * found within it, including plain same-document fragments like
 * "#/components/schemas/foo". A schema entry that keeps its source
 * file's own $id therefore rebases its — and every nested schema's —
 * $refs off the bundle's own root, onto that $id's URI instead.
 *
 * @apidevtools/json-schema-ref-parser (used below) does NOT implement
 * this rule — verified directly: dereferencing the actual pre-fix
 * bundle (git history, 25 $id occurrences) neither throws nor leaves
 * any unresolved $ref in its output, because it always treats
 * fragment-only $refs as plain JSON Pointers into the already-loaded
 * document, full stop, regardless of any $id encountered along the
 * way. It cannot pin this specific bug by itself; this base-URI walk
 * is what actually does.
 */
function findRefEscapes(document: unknown): RefEscape[] {
  const escapes: RefEscape[] = [];

  function walk(node: unknown, base: string, path: string[]): void {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, base, [...path, String(index)]));
      return;
    }

    if (node === null || typeof node !== "object") {
      return;
    }

    const obj = node as Record<string, unknown>;

    let scopedBase = base;

    if (typeof obj.$id === "string") {
      scopedBase = new URL(obj.$id, base).toString();
    }

    if (typeof obj.$ref === "string") {
      const resolved = new URL(obj.$ref, scopedBase).toString();

      if (resolved.split("#")[0] !== DOCUMENT_BASE.split("#")[0]) {
        escapes.push({
          path: path.join("/"),
          ref: obj.$ref,
          resolvedAgainst: scopedBase,
          resolvedTo: resolved,
        });
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === "$ref") {
        continue;
      }

      walk(value, scopedBase, [...path, key]);
    }
  }

  walk(document, DOCUMENT_BASE, []);

  return escapes;
}

/**
 * Regression test for a resolver-strictness gap redocly lint does not
 * catch (see scripts/strip-openapi-schema-ids.ts, wired into the
 * npm run openapi pipeline): components.schemas entries bundled from
 * schemas/*.schema.json used to retain their source files' own
 * $id/$schema, which rebases $ref resolution under strict (OAS 3.1 /
 * JSON Schema 2020-12) resolvers — including the one Swagger UI uses,
 * though not redocly's own lint.
 */
describe("openapi.bundled.yaml — full dereference", () => {
  it("has no $ref that escapes the document under $id-aware base-URI resolution", () => {
    const specPath = findBundledSpec();
    const document = parse(readFileSync(specPath, "utf8"));

    const escapes = findRefEscapes(document);

    expect(escapes).toEqual([]);
  });

  it("does not carry $id/$schema into any bundled component schema", () => {
    const specPath = findBundledSpec();
    const document = parse(readFileSync(specPath, "utf8")) as {
      components?: { schemas?: Record<string, Record<string, unknown>> };
    };

    const schemas = document.components?.schemas ?? {};

    expect(Object.keys(schemas).length).toBeGreaterThan(0);

    for (const schema of Object.values(schemas)) {
      expect(schema).not.toHaveProperty("$id");
      expect(schema).not.toHaveProperty("$schema");
    }
  });

  it("resolves as plain JSON Pointers with no unresolved $ref (basic structural sanity check)", async () => {
    const specPath = findBundledSpec();

    const dereferenced = await $RefParser.dereference(specPath);

    expect(JSON.stringify(dereferenced)).not.toContain('"$ref"');
  });

  it("fully expands the previously-broken execution-trust-record composite refs", async () => {
    const specPath = findBundledSpec();

    const dereferenced = (await $RefParser.dereference(specPath)) as {
      components: {
        schemas: {
          "execution-trust-record.schema": {
            properties: {
              transaction: { type?: string };
              overrides: { items: { type?: string } };
              executions: { items: { type?: string } };
              verifications: { items: { type?: string } };
              receipts: { items: { type?: string } };
            };
          };
        };
      };
    };

    const trustRecord =
      dereferenced.components.schemas["execution-trust-record.schema"];

    expect(trustRecord.properties.transaction.type).toBe("object");
    expect(trustRecord.properties.overrides.items.type).toBe("object");
    expect(trustRecord.properties.executions.items.type).toBe("object");
    expect(trustRecord.properties.verifications.items.type).toBe("object");
    expect(trustRecord.properties.receipts.items.type).toBe("object");
  });
});
