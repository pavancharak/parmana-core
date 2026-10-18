import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Serves the handbook PDF directly from this API, rather than from
 * the docs site (Mintlify): PDF file serving on Mintlify requires an
 * Enterprise plan, so a redirect to a Mintlify-hosted PDF 404s on any
 * other plan -- a real platform limitation discovered after the docs
 * site itself was confirmed live and working for every other page.
 * This API is a plain Vercel serverless Function with no such
 * restriction, and reads the bundled file the same way
 * findOpenApiSpecFile.ts already does for openapi.bundled.yaml:
 * walking up from this module's own compiled location so it works
 * identically under tsx (src/) and the compiled build (dist/). See
 * vercel.json's functions.api/index.ts.includeFiles, which must
 * bundle docs/site/parmana-handbook.pdf for this to find it in
 * production.
 */
function findHandbookPdf(startDir: string): string {
  let current = startDir;

  while (true) {
    const candidate = join(current, "docs", "site", "parmana-handbook.pdf");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      throw new Error(
        "docs/site/parmana-handbook.pdf not found in any parent directory. " +
          "Run `npx tsx scripts/generate-handbook-pdf.ts`.",
      );
    }

    current = parent;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pdfPath = findHandbookPdf(__dirname);
const pdfBuffer = readFileSync(pdfPath);

const router = Router();

router.get("/", (_req, res) => {
  res.set({
    "Cache-Control": "public, max-age=3600",
    "Content-Disposition": 'inline; filename="parmana-handbook.pdf"',
  });

  res.type("application/pdf").send(pdfBuffer);
});

export default router;
