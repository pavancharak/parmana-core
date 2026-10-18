import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";

/**
 * GET /openapi.json serves the same bundled spec as GET /openapi.yaml,
 * JSON-serialized, exempt from caller authentication for the same
 * reason, see packages/api/src/routes/openapi-json.ts.
 */
describe("GET /openapi.json", () => {
  it("returns 200 with a valid, self-contained OpenAPI document as JSON", async () => {
    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);

    const spec = response.body as { openapi?: string; paths?: object };

    expect(spec.openapi).toMatch(/^3\.1/);
    expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThan(0);
  });

  it("describes the identical spec as GET /openapi.yaml", async () => {
    const [jsonResponse, yamlResponse] = await Promise.all([
      request(app).get("/openapi.json"),
      request(app).get("/openapi.yaml"),
    ]);

    const { load } = await import("js-yaml");
    const yamlSpec = load(yamlResponse.text);

    expect(jsonResponse.body).toEqual(yamlSpec);
  });
});
