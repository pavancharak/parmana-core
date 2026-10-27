import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  NonceAlreadyConsumedError,
  OutcomeUnknownError,
} from "@parmana/shared";

import { createErrorHandler } from "../../src/middleware/error-handler.js";

function appThatThrows(error: unknown) {
  const app = express();

  app.post("/x", (_req, _res, next) => next(error));
  app.use(createErrorHandler());

  return app;
}

describe("Outcome unknown error (G-125)", () => {
  it("returns a 409 with code OUTCOME_UNKNOWN, not a bare 500", async () => {
    const response = await request(
      appThatThrows(new OutcomeUnknownError("btx-42")),
    ).post("/x");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("OUTCOME_UNKNOWN");
    expect(response.body.error).toContain("'btx-42'");
    expect(response.body.error).toContain("Do not retry");
  });

  it("keeps the replay refusal a 409 with its own code, unchanged", async () => {
    const response = await request(
      appThatThrows(new NonceAlreadyConsumedError("btx-42")),
    ).post("/x");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("NONCE_ALREADY_CONSUMED");
  });
});
