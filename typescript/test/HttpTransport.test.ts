/**
 * Parmana TypeScript SDK
 *
 * HttpTransport tests.
 *
 * Covers the three gaps found and fixed in this pass:
 * 1. No bearer-key attachment — Authorization header tests below.
 * 2. Error taxonomy never thrown — status-to-error-class mapping tests
 *    below, using response shapes copied verbatim from the real,
 *    verified error catalog (/api-reference/error-catalog), not
 *    guessed.
 * 3. Empty test suite — this file (previously 0 bytes).
 *
 * All HTTP interaction here is a mocked global fetch, exercising
 * HttpTransport in isolation. Real-server verification (the SDK against
 * an actual running @parmana/api instance) lives in
 * test/integration/parmana-client.integration.test.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpTransport } from "../src/transport/HttpTransport.js";
import type { Configuration } from "../src/config/Configuration.js";

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
import { ParmanaError } from "../src/errors/ParmanaError.js";

interface FakeResponseInit {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly unparseableBody?: boolean;
}

function fakeResponse(init: FakeResponseInit): Response {
  const headerEntries = Object.entries(init.headers ?? {});

  return {
    status: init.status,
    headers: {
      forEach: (callback: (value: string, key: string) => void) => {
        for (const [key, value] of headerEntries) {
          callback(value, key);
        }
      },
    },
    json: async () => {
      if (init.unparseableBody === true) {
        throw new SyntaxError("Unexpected end of JSON input");
      }
      return init.body;
    },
  } as unknown as Response;
}

function configureFetchMock(
  implementation: (url: string, requestInit: RequestInit) => Promise<Response>,
): void {
  vi.stubGlobal("fetch", vi.fn(implementation));
}

function baseConfiguration(overrides?: Partial<Configuration>): Configuration {
  return {
    endpoint: "http://localhost:3000",
    ...overrides,
  };
}

describe("HttpTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("bearer-key authentication", () => {
    it("attaches Authorization: Bearer <apiKey> when apiKey is configured", async () => {
      let capturedHeaders: Record<string, string> | undefined;

      configureFetchMock(async (_url, requestInit) => {
        capturedHeaders = requestInit.headers as Record<string, string>;
        return fakeResponse({ status: 200, body: { status: "UP" } });
      });

      const transport = new HttpTransport(
        baseConfiguration({ apiKey: "my-secret-api-key" }),
      );

      await transport.send({ method: "GET", path: "/version" });

      expect(capturedHeaders?.Authorization).toBe("Bearer my-secret-api-key");
    });

    it("omits Authorization entirely when no apiKey is configured", async () => {
      let capturedHeaders: Record<string, string> | undefined;

      configureFetchMock(async (_url, requestInit) => {
        capturedHeaders = requestInit.headers as Record<string, string>;
        return fakeResponse({ status: 200, body: { status: "UP" } });
      });

      const transport = new HttpTransport(baseConfiguration());

      await transport.send({ method: "GET", path: "/health" });

      expect(capturedHeaders?.Authorization).toBeUndefined();
    });

    it("lets an explicit per-request header override the configured apiKey", async () => {
      let capturedHeaders: Record<string, string> | undefined;

      configureFetchMock(async (_url, requestInit) => {
        capturedHeaders = requestInit.headers as Record<string, string>;
        return fakeResponse({ status: 200, body: {} });
      });

      const transport = new HttpTransport(
        baseConfiguration({ apiKey: "configured-key" }),
      );

      await transport.send({
        method: "GET",
        path: "/version",
        headers: { Authorization: "Bearer explicit-override" },
      });

      expect(capturedHeaders?.Authorization).toBe("Bearer explicit-override");
    });
  });

  describe("successful responses", () => {
    it("returns status, headers, and body unmodified for a 2xx response", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 200,
          body: { name: "Parmana", version: "0.4.0", api: "v1" },
          headers: { "x-request-id": "req-1" },
        }),
      );

      const transport = new HttpTransport(
        baseConfiguration({ apiKey: "my-secret-api-key" }),
      );

      const response = await transport.send({
        method: "GET",
        path: "/version",
      });

      expect(response.status).toBe(200);
      expect(response.headers["x-request-id"]).toBe("req-1");
      expect(response.body).toEqual({
        name: "Parmana",
        version: "0.4.0",
        api: "v1",
      });
    });
  });

  describe("error taxonomy — real, verified response shapes", () => {
    it("maps 401 (authentication required) to AuthenticationError", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 401,
          body: { error: "authentication required" },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "GET", path: "/version" }),
      ).rejects.toThrowError(AuthenticationError);

      await expect(
        transport.send({ method: "GET", path: "/version" }),
      ).rejects.toMatchObject({ message: "authentication required" });
    });

    it("maps 400 (malformed businessTransactionId) to ValidationError", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 400,
          body: { error: "businessTransactionId must be a valid UUID." },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "POST", path: "/execute" }),
      ).rejects.toThrowError(ValidationError);
    });

    it("maps 403 (caller not permitted to assert this authority.principalId) to AuthorizationError", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 403,
          body: {
            error:
              "Caller is not permitted to assert this authority.principalId.",
          },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "POST", path: "/execute" }),
      ).rejects.toThrowError(AuthorizationError);
    });

    it("maps 404 (Execution Trust Record not found, no code) to NotFoundError", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 404,
          body: { error: "Execution Trust Record not found." },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "GET", path: "/trust-records/x" }),
      ).rejects.toThrowError(NotFoundError);
    });

    it("maps 409 (duplicate businessTransactionId) to ConflictError", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 409,
          body: {
            error:
              "Business Transaction 'a1a1a1a1-1111-4111-8111-111111111111' already exists.",
          },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "POST", path: "/execute" }),
      ).rejects.toThrowError(ConflictError);
    });

    it("maps 403 with code POLICY_DENIED to ExecutionRejectedError, not AuthorizationError", async () => {
      // A policy REJECTED decision now carries its own dedicated 403 +
      // code POLICY_DENIED (packages/runtime/src/ExecutionGate.ts),
      // replacing the old, ambiguous 500 + code RUNTIME_ERROR shape.
      // Distinguished from the *other* 403 above (caller-identity
      // mismatch, no code) purely by the presence of this code.
      configureFetchMock(async () =>
        fakeResponse({
          status: 403,
          body: {
            error:
              "Execution rejected: Vendor payment rejected because the assessed payment risk exceeds the maximum permitted threshold.",
            code: "POLICY_DENIED",
          },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "POST", path: "/execute" }),
      ).rejects.toThrowError(ExecutionRejectedError);
    });

    it("maps 403 with code CAPABILITY_NOT_ALLOWED to AuthorizationError, preserving serverCode", async () => {
      // A caller-capability-scoping denial (isCapabilityAllowed.ts)
      // carries its own code, distinct from the plain caller-identity
      // 403 above (no code at all) and from POLICY_DENIED (a different
      // error class entirely) -- checked ahead of the generic 403
      // branch in mapHttpErrorResponse.ts for exactly this reason.
      configureFetchMock(async () =>
        fakeResponse({
          status: 403,
          body: {
            error: "Caller is not permitted to invoke this capability.",
            code: "CAPABILITY_NOT_ALLOWED",
          },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      const error = await transport
        .send({ method: "POST", path: "/execute" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).serverCode).toBe(
        "CAPABILITY_NOT_ALLOWED",
      );
    });

    it("maps 429 to RateLimitError, parsing Retry-After from real response headers", async () => {
      // POST /execute is per-caller-identity rate limited (packages/api's
      // rate-limiting middleware); this proves the real fetch Headers
      // iteration path (not just the unit-level extractRetryAfterSeconds
      // helper) actually threads the header through HttpTransport into
      // mapHttpErrorResponse.
      configureFetchMock(async () =>
        fakeResponse({
          status: 429,
          body: { error: "Too many requests." },
          headers: { "retry-after": "12" },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      const error = await transport
        .send({ method: "POST", path: "/execute" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfterSeconds).toBe(12);
    });

    it('maps a generic uncoded 500 ("Internal Server Error") to InternalServerError', async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 500,
          body: { error: "Internal Server Error" },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "POST", path: "/execute" }),
      ).rejects.toThrowError(InternalServerError);
    });

    it("falls back to InternalServerError for an unparseable/empty error body", async () => {
      configureFetchMock(async () =>
        fakeResponse({ status: 500, unparseableBody: true }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "GET", path: "/anything" }),
      ).rejects.toThrowError(InternalServerError);
    });

    it("thrown errors are the mapped typed error, not re-wrapped as NetworkError", async () => {
      // Regression guard: HttpTransport's outer try/catch wraps
      // unexpected failures as NetworkError. The status-mapped throw
      // must be recognized and passed through unchanged.
      configureFetchMock(async () =>
        fakeResponse({
          status: 401,
          body: { error: "authentication required" },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      let caught: unknown;
      try {
        await transport.send({ method: "GET", path: "/version" });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(AuthenticationError);
      expect(caught).not.toBeInstanceOf(NetworkError);
    });
  });

  describe("nonThrowingStatuses (POST /policies/validate's own shape)", () => {
    it("returns the response normally for a status listed in nonThrowingStatuses", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 404,
          body: {
            valid: false,
            errors: ["Policy 'does-not-exist' version '9.9.9' was not found."],
          },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      const response = await transport.send({
        method: "POST",
        path: "/policies/validate",
        nonThrowingStatuses: [400, 404],
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        valid: false,
        errors: ["Policy 'does-not-exist' version '9.9.9' was not found."],
      });
    });

    it("still throws for a status not in nonThrowingStatuses (401 on the same route)", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 401,
          body: { error: "authentication required" },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({
          method: "POST",
          path: "/policies/validate",
          nonThrowingStatuses: [400, 404],
        }),
      ).rejects.toThrowError(AuthenticationError);
    });
  });

  describe("network failures", () => {
    it("wraps a fetch rejection as NetworkError", async () => {
      configureFetchMock(async () => {
        throw new Error("getaddrinfo ENOTFOUND localhost");
      });

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "GET", path: "/health" }),
      ).rejects.toThrowError(NetworkError);
    });

    it("raises TimeoutError when the request is aborted on timeout", async () => {
      configureFetchMock(
        (_url, requestInit) =>
          new Promise((_resolve, reject) => {
            const signal = requestInit.signal as AbortSignal;
            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      );

      const transport = new HttpTransport(baseConfiguration({ timeout: 5 }));

      await expect(
        transport.send({ method: "GET", path: "/health" }),
      ).rejects.toThrowError(TimeoutError);
    });
  });

  describe("ParmanaError base class", () => {
    it("every thrown error is a ParmanaError with a stable code", async () => {
      configureFetchMock(async () =>
        fakeResponse({
          status: 400,
          body: { error: "businessTransactionId is required." },
        }),
      );

      const transport = new HttpTransport(baseConfiguration());

      await expect(
        transport.send({ method: "POST", path: "/replay" }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    it("ValidationError extends ParmanaError", () => {
      const error = new ValidationError("test");
      expect(error).toBeInstanceOf(ParmanaError);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
