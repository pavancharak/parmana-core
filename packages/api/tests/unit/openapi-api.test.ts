import { describe, expect, it } from "vitest";
import request from "supertest";
import { load } from "js-yaml";

import app from "../test-app.js";

/**
 * GET /openapi.yaml serves the bundled spec as a static file, exempt
 * from caller authentication for the same reason GET /health is, see
 * packages/api/src/routes/openapi.ts.
 */
describe("GET /openapi.yaml", () => {
  it("returns 200 with a valid, self-contained OpenAPI document", async () => {
    const response = await request(app).get("/openapi.yaml");

    expect(response.status).toBe(200);

    const spec = load(response.text) as { openapi?: string; paths?: object };

    expect(spec.openapi).toMatch(/^3\.1/);
    expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThan(0);
  });
});
