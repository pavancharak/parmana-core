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

const router = Router();

router.get("/", (_req, res) => {
  res.set({
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });

  res.type("application/yaml").send(specYaml);
});

export default router;
