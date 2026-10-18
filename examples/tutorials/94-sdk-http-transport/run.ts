import { HttpTransport } from "../../../typescript/src/transport/HttpTransport.js";
import type { Configuration } from "../../../typescript/src/config/Configuration.js";
import { ValidationError } from "../../../typescript/src/errors/ValidationError.js";
import { AuthenticationError } from "../../../typescript/src/errors/AuthenticationError.js";
import { AuthorizationError } from "../../../typescript/src/errors/AuthorizationError.js";
import { NotFoundError } from "../../../typescript/src/errors/NotFoundError.js";
import { ConflictError } from "../../../typescript/src/errors/ConflictError.js";
import { ExecutionRejectedError } from "../../../typescript/src/errors/ExecutionRejectedError.js";
import { InternalServerError } from "../../../typescript/src/errors/InternalServerError.js";
import { NetworkError } from "../../../typescript/src/errors/NetworkError.js";
import { TimeoutError } from "../../../typescript/src/errors/TimeoutError.js";
import { ParmanaError } from "../../../typescript/src/errors/ParmanaError.js";

//
// Every other tutorial in this suite proves server-side behavior. This
// one proves the published npm SDK's own client-side transport layer:
// bearer-key attachment and the status-code -> typed-error-class
// mapping external integrators actually catch (`catch (e) { if (e
// instanceof ExecutionRejectedError) ... }`), using response shapes
// copied from the real, documented error catalog -- not guessed.
//
const originalFetch = globalThis.fetch;

function stubFetch(
  implementation: (url: string, init: RequestInit) => Promise<Response>,
): void {
  globalThis.fetch = implementation as typeof fetch;
}

function fakeResponse(init: {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  unparseable?: boolean;
}): Response {
  const headerEntries = Object.entries(init.headers ?? {});
  return {
    status: init.status,
    headers: {
      forEach: (cb: (value: string, key: string) => void) =>
        headerEntries.forEach(([k, v]) => cb(v, k)),
    },
    json: async () => {
      if (init.unparseable === true)
        throw new SyntaxError("Unexpected end of JSON input");
      return init.body;
    },
  } as unknown as Response;
}

function baseConfig(overrides?: Partial<Configuration>): Configuration {
  return { endpoint: "http://localhost:3000", ...overrides };
}

console.log();
console.log("==================================================");
console.log("Tutorial 94 - SDK HTTP Transport");
console.log("==================================================");
console.log();

const results: { name: string; passed: boolean }[] = [];
function check(name: string, passed: boolean): void {
  results.push({ name, passed });
  console.log(`  ${passed ? "✓" : "✗"} ${name}`);
}

try {
  console.log("Bearer-key authentication");
  console.log("--------------------------------------------------");
  {
    let captured: Record<string, string> | undefined;
    stubFetch(async (_url, init) => {
      captured = init.headers as Record<string, string>;
      return fakeResponse({ status: 200, body: { status: "UP" } });
    });
    const transport = new HttpTransport(
      baseConfig({ apiKey: "my-secret-api-key" }),
    );
    await transport.send({ method: "GET", path: "/version" });
    check(
      "attaches Authorization: Bearer <apiKey> when configured",
      captured?.Authorization === "Bearer my-secret-api-key",
    );
  }
  {
    let captured: Record<string, string> | undefined;
    stubFetch(async (_url, init) => {
      captured = init.headers as Record<string, string>;
      return fakeResponse({ status: 200, body: { status: "UP" } });
    });
    const transport = new HttpTransport(baseConfig());
    await transport.send({ method: "GET", path: "/health" });
    check(
      "omits Authorization entirely when no apiKey configured",
      captured?.Authorization === undefined,
    );
  }
  console.log();

  console.log(
    "Error taxonomy -- real, documented response shapes mapped to typed errors",
  );
  console.log("--------------------------------------------------");
  {
    stubFetch(async () =>
      fakeResponse({ status: 401, body: { error: "authentication required" } }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "GET", path: "/version" });
    } catch (e) {
      caught = e;
    }
    check("401 -> AuthenticationError", caught instanceof AuthenticationError);
  }
  {
    stubFetch(async () =>
      fakeResponse({
        status: 400,
        body: { error: "businessTransactionId must be a valid UUID." },
      }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "POST", path: "/execute" });
    } catch (e) {
      caught = e;
    }
    check("400 -> ValidationError", caught instanceof ValidationError);
  }
  {
    stubFetch(async () =>
      fakeResponse({
        status: 403,
        body: {
          error:
            "Caller is not permitted to assert this authority.principalId.",
        },
      }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "POST", path: "/execute" });
    } catch (e) {
      caught = e;
    }
    check(
      "403, no code (caller-identity mismatch) -> AuthorizationError",
      caught instanceof AuthorizationError,
    );
  }
  {
    stubFetch(async () =>
      fakeResponse({
        status: 403,
        body: {
          error: "Execution rejected: risk exceeds threshold.",
          code: "POLICY_DENIED",
        },
      }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "POST", path: "/execute" });
    } catch (e) {
      caught = e;
    }
    check(
      "403 + code POLICY_DENIED -> ExecutionRejectedError, NOT AuthorizationError",
      caught instanceof ExecutionRejectedError &&
        !(caught instanceof AuthorizationError),
    );
  }
  {
    stubFetch(async () =>
      fakeResponse({
        status: 404,
        body: { error: "Execution Trust Record not found." },
      }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "GET", path: "/trust-records/x" });
    } catch (e) {
      caught = e;
    }
    check("404 -> NotFoundError", caught instanceof NotFoundError);
  }
  {
    stubFetch(async () =>
      fakeResponse({
        status: 409,
        body: { error: "Business Transaction already exists." },
      }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "POST", path: "/execute" });
    } catch (e) {
      caught = e;
    }
    check("409 -> ConflictError", caught instanceof ConflictError);
  }
  {
    stubFetch(async () =>
      fakeResponse({ status: 500, body: { error: "Internal Server Error" } }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "POST", path: "/execute" });
    } catch (e) {
      caught = e;
    }
    check(
      "500, uncoded -> InternalServerError",
      caught instanceof InternalServerError,
    );
  }
  {
    stubFetch(async () => fakeResponse({ status: 500, unparseable: true }));
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "GET", path: "/anything" });
    } catch (e) {
      caught = e;
    }
    check(
      "unparseable error body -> falls back to InternalServerError, doesn't crash",
      caught instanceof InternalServerError,
    );
  }
  console.log();

  console.log("nonThrowingStatuses (POST /policies/validate's own shape)");
  console.log("--------------------------------------------------");
  {
    stubFetch(async () =>
      fakeResponse({
        status: 404,
        body: { valid: false, errors: ["Policy not found."] },
      }),
    );
    const transport = new HttpTransport(baseConfig());
    const response = await transport.send({
      method: "POST",
      path: "/policies/validate",
      nonThrowingStatuses: [400, 404],
    });
    check(
      "a listed status (404) returns normally instead of throwing",
      response.status === 404 &&
        (response.body as { valid: boolean }).valid === false,
    );
  }
  console.log();

  console.log("Network failures");
  console.log("--------------------------------------------------");
  {
    stubFetch(async () => {
      throw new Error("getaddrinfo ENOTFOUND localhost");
    });
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "GET", path: "/health" });
    } catch (e) {
      caught = e;
    }
    check(
      "a fetch rejection wraps as NetworkError",
      caught instanceof NetworkError,
    );
  }
  {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const transport = new HttpTransport(baseConfig({ timeout: 5 }));
    let caught: unknown;
    try {
      await transport.send({ method: "GET", path: "/health" });
    } catch (e) {
      caught = e;
    }
    check(
      "an aborted (timed-out) request raises TimeoutError",
      caught instanceof TimeoutError,
    );
  }
  console.log();

  console.log("ParmanaError base class");
  console.log("--------------------------------------------------");
  {
    stubFetch(async () =>
      fakeResponse({
        status: 400,
        body: { error: "businessTransactionId is required." },
      }),
    );
    const transport = new HttpTransport(baseConfig());
    let caught: unknown;
    try {
      await transport.send({ method: "POST", path: "/replay" });
    } catch (e) {
      caught = e;
    }
    check(
      "every thrown error is a ParmanaError with a stable code",
      caught instanceof ParmanaError &&
        (caught as ParmanaError).code === "VALIDATION_ERROR",
    );
  }
  console.log();

  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(
      "✓ Every SDK transport behavior above matched its documented contract.",
    );
  } else {
    console.log(
      `✗ ${results.filter((r) => !r.passed).length} of ${results.length} checks failed.`,
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 95 - Generic Approval Verifier");
} finally {
  globalThis.fetch = originalFetch;
}
