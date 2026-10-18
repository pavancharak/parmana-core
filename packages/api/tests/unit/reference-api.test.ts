import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";

/**
 * GET /reference serves a read-only ReDoc page against this server's own
 * GET /openapi.yaml, exempt from caller authentication for the same
 * reason GET /documentation is, see packages/api/src/routes/reference.ts.
 */
describe("GET /reference", () => {
  it("returns 200 with an HTML page that points ReDoc at /openapi.yaml", async () => {
    const response = await request(app).get("/reference");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain('spec-url="/openapi.yaml"');
  });
});
