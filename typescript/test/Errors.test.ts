/**
 * Parmana TypeScript SDK
 *
 * Error class and error-mapping unit tests.
 *
 * HttpTransport.test.ts proves these classes get thrown for real,
 * observed HTTP responses. This file proves each class's own contract
 * (code, name, ParmanaError inheritance, optional requestId/cause) in
 * isolation, plus direct unit coverage of mapHttpErrorResponse.
 */

import { describe, expect, it } from "vitest";

import { ErrorCode, ParmanaError } from "../src/errors/ParmanaError.js";
import { ConfigurationError } from "../src/errors/ConfigurationError.js";
import { ValidationError } from "../src/errors/ValidationError.js";
import { AuthenticationError } from "../src/errors/AuthenticationError.js";
import { AuthorizationError } from "../src/errors/AuthorizationError.js";
import { NotFoundError } from "../src/errors/NotFoundError.js";
import { ConflictError } from "../src/errors/ConflictError.js";
import { ExecutionRejectedError } from "../src/errors/ExecutionRejectedError.js";
import { InternalServerError } from "../src/errors/InternalServerError.js";
import { NetworkError } from "../src/errors/NetworkError.js";
import { RateLimitError } from "../src/errors/RateLimitError.js";
import { TimeoutError } from "../src/errors/TimeoutError.js";
import { ReplayError } from "../src/errors/ReplayError.js";
import { VerificationError } from "../src/errors/VerificationError.js";

import { mapHttpErrorResponse } from "../src/transport/mapHttpErrorResponse.js";

const CLASSES: ReadonlyArray<{
  readonly name: string;
  readonly code: ErrorCode;
  readonly construct: (
    message: string,
    options?: { requestId?: string; cause?: unknown },
  ) => ParmanaError;
}> = [
  {
    name: "ConfigurationError",
    code: ErrorCode.CONFIGURATION_ERROR,
    construct: (m, o) => new ConfigurationError(m, o),
  },
  {
    name: "ValidationError",
    code: ErrorCode.VALIDATION_ERROR,
    construct: (m, o) => new ValidationError(m, o),
  },
  {
    name: "AuthenticationError",
    code: ErrorCode.AUTHENTICATION_ERROR,
    construct: (m, o) => new AuthenticationError(m, o),
  },
  {
    name: "AuthorizationError",
    code: ErrorCode.AUTHORIZATION_ERROR,
    construct: (m, o) => new AuthorizationError(m, o),
  },
  {
    name: "NotFoundError",
    code: ErrorCode.NOT_FOUND_ERROR,
    construct: (m, o) => new NotFoundError(m, o),
  },
  {
    name: "ConflictError",
    code: ErrorCode.CONFLICT_ERROR,
    construct: (m, o) => new ConflictError(m, o),
  },
  {
    name: "ExecutionRejectedError",
    code: ErrorCode.EXECUTION_REJECTED,
    construct: (m, o) => new ExecutionRejectedError(m, o),
  },
  {
    name: "InternalServerError",
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    construct: (m, o) => new InternalServerError(m, o),
  },
  {
    name: "NetworkError",
    code: ErrorCode.NETWORK_ERROR,
    construct: (m, o) => new NetworkError(m, o),
  },
  {
    name: "TimeoutError",
    code: ErrorCode.TIMEOUT_ERROR,
    construct: (m, o) => new TimeoutError(m, o),
  },
  {
    name: "RateLimitError",
    code: ErrorCode.RATE_LIMIT_ERROR,
    construct: (m, o) => new RateLimitError(m, o),
  },
  {
    name: "ReplayError",
    code: ErrorCode.REPLAY_ERROR,
    construct: (m, o) => new ReplayError(m, o),
  },
  {
    name: "VerificationError",
    code: ErrorCode.VERIFICATION_ERROR,
    construct: (m, o) => new VerificationError(m, o),
  },
];

describe("SDK error classes", () => {
  for (const { name, code, construct } of CLASSES) {
    describe(name, () => {
      it(`extends ParmanaError and Error, sets name "${name}" and code "${code}"`, () => {
        const error = construct("something went wrong");

        expect(error).toBeInstanceOf(ParmanaError);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe(name);
        expect(error.code).toBe(code);
        expect(error.message).toBe("something went wrong");
      });

      it("carries an optional requestId when supplied", () => {
        const error = construct("failed", { requestId: "req-123" });
        expect(error.requestId).toBe("req-123");
      });

      it("omits requestId when not supplied", () => {
        const error = construct("failed");
        expect(error.requestId).toBeUndefined();
      });

      it("carries an optional cause when supplied", () => {
        const underlying = new Error("underlying");
        const error = construct("failed", { cause: underlying });
        expect(error.cause).toBe(underlying);
      });
    });
  }

  it("every ErrorCode value is unique", () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it("RateLimitError carries an optional retryAfterSeconds when supplied", () => {
    const error = new RateLimitError("rate limited", { retryAfterSeconds: 30 });
    expect(error.retryAfterSeconds).toBe(30);
  });

  it("RateLimitError omits retryAfterSeconds when not supplied", () => {
    const error = new RateLimitError("rate limited");
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it("AuthorizationError carries an optional serverCode when supplied", () => {
    const error = new AuthorizationError("not allowed", {
      serverCode: "CAPABILITY_NOT_ALLOWED",
    });
    expect(error.serverCode).toBe("CAPABILITY_NOT_ALLOWED");
  });

  it("AuthorizationError omits serverCode when not supplied", () => {
    const error = new AuthorizationError("not allowed");
    expect(error.serverCode).toBeUndefined();
  });
});

describe("mapHttpErrorResponse", () => {
  it("maps 400 to ValidationError using the response's error message", () => {
    const error = mapHttpErrorResponse(400, {
      error: "businessTransactionId must be a valid UUID.",
    });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("businessTransactionId must be a valid UUID.");
  });

  it("maps 401 to AuthenticationError", () => {
    const error = mapHttpErrorResponse(401, {
      error: "authentication required",
    });
    expect(error).toBeInstanceOf(AuthenticationError);
  });

  it("maps 403 to AuthorizationError", () => {
    const error = mapHttpErrorResponse(403, {
      error: "Caller is not permitted to assert this authority.principalId.",
    });
    expect(error).toBeInstanceOf(AuthorizationError);
  });

  it("maps 404 to NotFoundError", () => {
    const error = mapHttpErrorResponse(404, {
      error: "Business Transaction not found.",
    });
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it("maps 404 with code VERIFICATION_FAILED (POST /verify's shape) to NotFoundError, by status not code", () => {
    const error = mapHttpErrorResponse(404, {
      error: "Execution Trust Record not found.",
      code: "VERIFICATION_FAILED",
    });
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it("maps a 503 SIGNING_UNAVAILABLE to InternalServerError, preserving the code as serverCode", () => {
    const error = mapHttpErrorResponse(503, {
      error:
        "Evidence signing is unavailable; refusing to release the action because a signed Execution Trust Record could not be produced. Nothing was executed.",
      code: "SIGNING_UNAVAILABLE",
    });

    expect(error).toBeInstanceOf(InternalServerError);
    expect((error as InternalServerError).serverCode).toBe(
      "SIGNING_UNAVAILABLE",
    );
    expect(error.message).toContain("Nothing was executed");
  });

  it("maps a 500 EXECUTION_RECORD_INCOMPLETE to InternalServerError, preserving the code as serverCode", () => {
    const error = mapHttpErrorResponse(500, {
      error:
        "The action for business transaction 'tx-1' was released to the execution system, but its signed Execution Trust Record could not be produced. Do not retry as a new transaction.",
      code: "EXECUTION_RECORD_INCOMPLETE",
    });

    expect(error).toBeInstanceOf(InternalServerError);
    expect((error as InternalServerError).serverCode).toBe(
      "EXECUTION_RECORD_INCOMPLETE",
    );
    expect(error.message).toContain("Do not retry as a new transaction");
  });

  it("leaves serverCode undefined on a 500 that carries no code", () => {
    const error = mapHttpErrorResponse(500, { error: "Internal Server Error" });

    expect(error).toBeInstanceOf(InternalServerError);
    expect((error as InternalServerError).serverCode).toBeUndefined();
  });

  it("maps 409 to ConflictError", () => {
    const error = mapHttpErrorResponse(409, {
      error:
        "Execution Trust Record must be successfully verified before a Receipt can be generated.",
      code: "RECEIPT_GENERATION_FAILED",
    });
    expect(error).toBeInstanceOf(ConflictError);
  });

  it("maps a 403 with code POLICY_DENIED to ExecutionRejectedError", () => {
    // A policy REJECTED decision (packages/runtime/src/ExecutionGate.ts)
    // now carries its own dedicated 403 + code, replacing the old,
    // ambiguous 500 + code RUNTIME_ERROR shape this mapping used to
    // special-case via an "Execution rejected" message-prefix sniff.
    const error = mapHttpErrorResponse(403, {
      error: "Execution rejected: some policy reason.",
      code: "POLICY_DENIED",
    });
    expect(error).toBeInstanceOf(ExecutionRejectedError);
  });

  it("does not misclassify a plain 403 (caller-identity mismatch, no code) as ExecutionRejectedError", () => {
    // Defensive: the *other* 403 this API returns — a caller asserting
    // an authority.principalId it isn't permitted to assert
    // (packages/api/src/routes/execute.ts) — carries no code field at
    // all and must still map to the generic AuthorizationError, not be
    // swept up by the POLICY_DENIED check above.
    const error = mapHttpErrorResponse(403, {
      error: "Caller is not permitted to assert this authority.principalId.",
    });
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error).not.toBeInstanceOf(ExecutionRejectedError);
  });

  it("maps a 403 with code CAPABILITY_NOT_ALLOWED to AuthorizationError, preserving the code as serverCode", () => {
    const error = mapHttpErrorResponse(403, {
      error: "Caller is not permitted to invoke this capability.",
      code: "CAPABILITY_NOT_ALLOWED",
    });
    expect(error).toBeInstanceOf(AuthorizationError);
    expect((error as AuthorizationError).serverCode).toBe(
      "CAPABILITY_NOT_ALLOWED",
    );
  });

  it("maps a 403 with code TENANT_NOT_ALLOWED to AuthorizationError, preserving the code as serverCode", () => {
    const error = mapHttpErrorResponse(403, {
      error: "Caller is not permitted to act for this tenantId.",
      code: "TENANT_NOT_ALLOWED",
    });
    expect(error).toBeInstanceOf(AuthorizationError);
    expect((error as AuthorizationError).serverCode).toBe("TENANT_NOT_ALLOWED");
  });

  it("maps 429 to RateLimitError, parsing Retry-After from headers", () => {
    const error = mapHttpErrorResponse(
      429,
      { error: "Too many requests." },
      { "retry-after": "30" },
    );
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(30);
  });

  it("maps 429 to RateLimitError with no retryAfterSeconds when the header is absent", () => {
    const error = mapHttpErrorResponse(429, { error: "Too many requests." });
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBeUndefined();
  });

  it("ignores a non-numeric Retry-After header", () => {
    const error = mapHttpErrorResponse(
      429,
      { error: "Too many requests." },
      { "retry-after": "not-a-number" },
    );
    expect((error as RateLimitError).retryAfterSeconds).toBeUndefined();
  });

  it("maps an uncoded 500 to InternalServerError", () => {
    const error = mapHttpErrorResponse(500, {
      error: "Internal Server Error",
    });
    expect(error).toBeInstanceOf(InternalServerError);
  });

  it("falls back to a generic message when the body has no error field", () => {
    const error = mapHttpErrorResponse(500, undefined);
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.message).toBe("Request failed with status 500.");
  });

  it("falls back to a generic message when the body's error field is not a string", () => {
    const error = mapHttpErrorResponse(500, { error: { nested: true } });
    expect(error.message).toBe("Request failed with status 500.");
  });

  it("ignores a non-string code field", () => {
    const error = mapHttpErrorResponse(500, {
      error: "Execution rejected: reason.",
      code: 12345,
    });
    // code isn't the string "RUNTIME_ERROR", so this must not be
    // classified as ExecutionRejectedError despite the message prefix.
    expect(error).toBeInstanceOf(InternalServerError);
  });
});
