import { Router } from "express";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { findOpenApiSpecFile } from "./findOpenApiSpecFile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const specPath = findOpenApiSpecFile(__dirname);
const specYaml = readFileSync(specPath, "utf8");

const spec = parse(specYaml);

if (!spec.openapi) {
  throw new Error("OpenAPI bundle is missing 'openapi'.");
}

if (!spec.info?.version) {
  throw new Error("OpenAPI bundle is missing info.version.");
}

if (!spec.paths) {
  throw new Error("OpenAPI bundle contains no paths.");
}

/**
 * JSON counterpart to GET /openapi.yaml, same bundled spec
 * (openapi/openapi.bundled.yaml), same content either way -- YAML is
 * a strict superset of JSON's data model, so parsing the committed
 * YAML and re-serializing it is lossless. Exists because some
 * tooling (and most AI coding agents) expects a machine-readable spec
 * at a `.json` path by convention, not everything that consumes
 * OpenAPI parses YAML. Serialized once at startup, not per-request.
 */
const specJson = JSON.stringify(spec);

const router = Router();

router.get("/", (_req, res) => {
  res.set({
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });

  res.type("application/json").send(specJson);
});

export default router;
