import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../test-app.js";

const packageVersion = (
  JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;

describe("GET /version and GET /api-manifest.json report the @parmana/api package version", () => {
  it("returns the package version as the build identifier, not a hand-typed constant", async () => {
    const res = await request(app).get("/version");
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(packageVersion);
    expect(res.body.api).toBe("v1");
  });

  it("reports the same build version in the API manifest", async () => {
    const res = await request(app).get("/api-manifest.json");
    expect(res.status).toBe(200);
    expect(res.body.buildVersion).toBe(packageVersion);
    expect(res.body.apiVersion).toBe("v1");
  });
});

describe("unmatched routes", () => {
  it("answer with JSON, in the same shape as other refusals, not an HTML page", async () => {
    const res = await request(app).get("/kill-switch/status");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: "Route not found.",
      code: "ROUTE_NOT_FOUND",
    });
  });
});
