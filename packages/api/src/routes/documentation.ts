import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { findOpenApiSpecFile } from "./findOpenApiSpecFile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const spec = parse(readFileSync(findOpenApiSpecFile(__dirname), "utf8"));

const router = Router();

router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(spec));

export default router;
