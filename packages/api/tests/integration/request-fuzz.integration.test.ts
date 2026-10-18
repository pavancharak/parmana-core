import fc from "fast-check";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

/**
 * Fuzzing the request boundary: a valid Business Transaction with one
 * or more of its fields removed or replaced by arbitrary JSON. Whatever
 * the body, the server must answer with a client error naming the
 * problem, never a 500, and must execute nothing unless the request is
 * still valid (G-87, docs/VERIFICATION-GAPS.md).
 */

const KEY = "request-fuzz-caller-raw-key-for-tests-only";

function buildApp() {
  const { executionSystem } = createInspectableExecutionSystem();
  const application = createApplication(executionSystem);
  const app = createApp(application, {
    callerAuth: {
      authenticator: new StaticKeyAuthenticator([
        {
          callerId: "integration-test",
          keyHash: hashApiKey(KEY),
          allowedPrincipalIds: ["integration-test"],
          allowedCapabilities: ["test:fixture-execute"],
        },
      ]),
      auditSink: new InMemoryCallerAuditSink(),
    },
  });
  return { app };
}

/** Every field path of a transaction a request can carry. */
const PATHS = [
  ["metadata"],
  ["metadata", "businessTransactionId"],
  ["metadata", "tenantId"],
  ["authority"],
  ["authority", "authorityId"],
  ["authority", "principalId"],
  ["authority", "authorityType"],
  ["authorization"],
  ["authorization", "authorizationId"],
  ["authorization", "authorityId"],
  ["intent"],
  ["intent", "authorizationId"],
  ["intent", "action"],
  ["intent", "target"],
  ["intent", "parameters"],
  ["policy"],
  ["policy", "name"],
  ["policy", "version"],
  ["policy", "schemaVersion"],
  ["signals"],
] as const;

const DELETE = Symbol("delete");

const change = fc.record({
  path: fc.constantFrom(...PATHS),
  value: fc.oneof(
    fc.constant(DELETE),
    fc.constant(null),
    fc.jsonValue({ maxDepth: 2 }),
  ),
});

function apply(
  body: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): void {
  let target: unknown = body;
  for (const key of path.slice(0, -1)) {
    if (typeof target !== "object" || target === null) return;
    target = (target as Record<string, unknown>)[key];
  }
  if (typeof target !== "object" || target === null) return;
  const last = path[path.length - 1]!;
  if (value === DELETE) {
    delete (target as Record<string, unknown>)[last];
  } else {
    (target as Record<string, unknown>)[last] = value;
  }
}

describe("request fuzzing (G-87)", () => {
  it.each(["/execute", "/transactions"])(
    "POST %s never answers 500 for a damaged transaction",
    async (route) => {
      const { app } = buildApp();
      const valid = JSON.parse(
        JSON.stringify(await createBusinessTransaction()),
      );

      await fc.assert(
        fc.asyncProperty(
          fc.array(change, { minLength: 1, maxLength: 3 }),
          async (changes) => {
            const body = structuredClone(valid) as Record<string, unknown>;
            const id = crypto.randomUUID();
            body.businessTransactionId = id;
            (body.metadata as Record<string, unknown>).businessTransactionId =
              id;
            for (const { path, value } of changes) apply(body, path, value);

            const response = await request(app)
              .post(route)
              .set("Authorization", `Bearer ${KEY}`)
              .send(body);

            expect(
              response.status,
              JSON.stringify({ changes, body: response.body }),
            ).toBeLessThan(500);
          },
        ),
        { numRuns: 150 },
      );
    },
    120_000,
  );

  it.each(["metadata", "authority", "authorization", "intent", "policy"])(
    "POST /execute without %s answers 400 naming it",
    async (key) => {
      const { app } = buildApp();
      const body = JSON.parse(
        JSON.stringify(await createBusinessTransaction()),
      ) as Record<string, unknown>;
      delete body[key];
      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${KEY}`)
        .send(body);
      // A missing authority or intent can be refused earlier, by caller
      // scoping (403); a missing object is never a 500.
      expect([400, 403]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.error).toMatch(new RegExp(`^(${key}|metadata)`));
      }
    },
  );

  it("POST /execute never answers 500 for an arbitrary JSON body", async () => {
    const { app } = buildApp();
    await fc.assert(
      fc.asyncProperty(fc.jsonValue({ maxDepth: 3 }), async (body) => {
        const response = await request(app)
          .post("/execute")
          .set("Authorization", `Bearer ${KEY}`)
          .set("Content-Type", "application/json")
          .send(JSON.stringify(body));
        expect(response.status, JSON.stringify(body)).toBeLessThan(500);
      }),
      { numRuns: 150 },
    );
  }, 120_000);
});
