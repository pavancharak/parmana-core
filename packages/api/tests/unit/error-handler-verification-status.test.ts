import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { AuthorizationVerificationFailedError } from "@parmana/shared";

import { createErrorHandler } from "../../src/middleware/error-handler.js";

function appThatThrows(error: unknown) {
  const app = express();

  app.post("/x", (_req, _res, next) => next(error));
  app.use(createErrorHandler());

  return app;
}

describe("Authorization verification failure is the caller's error, not a server fault", () => {
  it("returns 403 with the failed checks named, not a generic 500", async () => {
    const response = await request(
      appThatThrows(
        new AuthorizationVerificationFailedError(
          "Execution Gateway rejected request: failed checks [signatureVerified].",
        ),
      ),
    ).post("/x");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("AUTHORIZATION_VERIFICATION_FAILED");
    expect(response.body.error).toContain("signatureVerified");
    expect(response.body.error).not.toBe("Internal Server Error");
  });
});
