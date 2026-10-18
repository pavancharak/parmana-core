import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createErrorHandler } from "../../src/middleware/error-handler.js";

/**
 * On Vercel, a malformed JSON body returned 500 (found 2026-09-28 from
 * production logs). Vercel's Node.js runtime reads the request body
 * itself and defines a lazy req.body getter (with a setter) that throws
 * Error("Invalid JSON") with statusCode 400, not body-parser's
 * entity.parse.failed error. This reproduces that chain: the stream is
 * already consumed, so express.json() skips parsing, and the route's
 * read of req.body throws into the real error handler.
 */
function appBehindVercelBodyGetter(error: Error) {
  const app = express();

  app.use((req, _res, next) => {
    req.on("data", () => {});
    req.on("end", () => {
      Object.defineProperty(req, "body", {
        configurable: true,
        get() {
          throw error;
        },
        set(value: unknown) {
          Object.defineProperty(req, "body", {
            configurable: true,
            writable: true,
            value,
          });
        },
      });
      next();
    });
  });
  app.use(express.json());
  app.post("/x", (req, res) => {
    res.status(200).json({ reached: true, body: req.body as unknown });
  });
  app.use(createErrorHandler());

  return app;
}

function vercelInvalidJsonError(): Error {
  return Object.assign(new Error("Invalid JSON"), { statusCode: 400 });
}

describe("Malformed JSON behind Vercel's req.body getter", () => {
  it("returns 400 Malformed JSON body, not 500", async () => {
    const response = await request(
      appBehindVercelBodyGetter(vercelInvalidJsonError()),
    )
      .post("/x")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Malformed JSON body." });
  });

  it("still returns a bare 500 for another error from the getter", async () => {
    const response = await request(
      appBehindVercelBodyGetter(
        Object.assign(new Error("something else"), { statusCode: 400 }),
      ),
    )
      .post("/x")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal Server Error" });
  });

  it("still returns a bare 500 for Invalid JSON without statusCode 400", async () => {
    const response = await request(
      appBehindVercelBodyGetter(new Error("Invalid JSON")),
    )
      .post("/x")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(response.status).toBe(500);
  });
});
