import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import request from "supertest";

import app from "../test-app.js";

/**
 * GET /api-manifest.json is the machine-readable SDK/discovery index,
 * exempt from caller authentication for the same reason as
 * /openapi.json, see packages/api/src/routes/api-manifest.ts. Its
 * version fields must match each package's own manifest exactly, not a
 * hand-typed copy that could drift.
 */
describe("GET /api-manifest.json", () => {
  it("returns 200 with a machine-readable manifest as JSON", async () => {
    const response = await request(app).get("/api-manifest.json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);

    const manifest = response.body as {
      openapi?: { json?: string; yaml?: string };
      sdks?: { typescript?: { version?: string } | null };
    };

    expect(manifest.openapi?.json).toBe("/openapi.json");
    expect(manifest.openapi?.yaml).toBe("/openapi.yaml");
  });

  it("reports the TypeScript SDK's real, current package.json version", async () => {
    const response = await request(app).get("/api-manifest.json");
    const manifest = response.body as {
      sdks: { typescript: { package: string; version: string } };
    };

    const tsPackageJson = JSON.parse(
      readFileSync("typescript/package.json", "utf8"),
    ) as { name: string; version: string };

    expect(manifest.sdks.typescript.package).toBe(tsPackageJson.name);
    expect(manifest.sdks.typescript.version).toBe(tsPackageJson.version);
  });

  it("reports the Python SDK's real, current pyproject.toml version", async () => {
    const response = await request(app).get("/api-manifest.json");
    const manifest = response.body as { sdks: { python: { version: string } } };

    const pyproject = readFileSync("python/pyproject.toml", "utf8");
    const match = pyproject.match(/^version\s*=\s*"([^"]+)"/m);

    expect(match).not.toBeNull();
    expect(manifest.sdks.python.version).toBe(match?.[1]);
  });

  it("reports no Go or Java SDK, matching sdks/other-languages.mdx", async () => {
    const response = await request(app).get("/api-manifest.json");
    const manifest = response.body as { sdks: { go: unknown; java: unknown } };

    expect(manifest.sdks.go).toBeNull();
    expect(manifest.sdks.java).toBeNull();
  });
});
