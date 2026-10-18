import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { InMemoryConnectorRegistry } from "@parmana/execution-control";
import { ConnectorNotRegisteredError } from "@parmana/shared";

import { createErrorHandler } from "../../src/middleware/error-handler.js";

function appThatThrows(error: unknown) {
  const app = express();

  app.post("/x", (_req, _res, next) => next(error));
  app.use(createErrorHandler());

  return app;
}

describe("Missing connector error", () => {
  it("returns a 503 with code CONNECTOR_NOT_REGISTERED, not a bare 500", async () => {
    const response = await request(
      appThatThrows(new ConnectorNotRegisteredError("paytm:refund")),
    ).post("/x");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("CONNECTOR_NOT_REGISTERED");
    expect(response.body.error).toContain("'paytm:refund'");
    expect(response.body.error).toContain("Nothing was executed");
  });

  it("is what a registry throws for an unregistered capability", () => {
    expect(() =>
      new InMemoryConnectorRegistry().resolveCapability("paytm:refund"),
    ).toThrow(ConnectorNotRegisteredError);
  });

  it("still returns a bare 500 for an unrelated plain Error", async () => {
    const response = await request(appThatThrows(new Error("boom"))).post("/x");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal Server Error" });
  });
});
