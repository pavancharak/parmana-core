/**
 * Parmana TypeScript SDK
 *
 * Real-server integration test.
 *
 * Boots the actual @parmana/api Express application (real
 * StaticKeyAuthenticator, real PolicyEngine, the real, NODE_ENV=test-only
 * generic test-fixture connector (createTestFixtureConnector.ts), real
 * Ed25519 signing via the hermetic keys vitest.setup.ts generates), binds
 * it to a real OS-assigned TCP port, and drives it
 * with the real ParmanaClient/HttpTransport over real HTTP — not
 * supertest, not a mock. This is what "verified against a real local
 * parmana instance" means for this SDK.
 *
 * Covers the three gaps this pass fixed, against real responses:
 * 1. Bearer-key auth: an authenticated request succeeds, an
 *    unauthenticated one gets a genuine 401.
 * 2. Error taxonomy: a real validation error, a real policy rejection,
 *    a real not-found, and a real duplicate all throw the correct typed
 *    error, built from what the server actually returned, not an
 *    assumption about what it would return.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";

import { createExecutionSystem } from "../../../packages/api/src/bootstrap/createExecutionSystem.js";
import { StaticKeyAuthenticator } from "../../../packages/api/src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../../packages/api/src/auth/InMemoryCallerAuditSink.js";
import { hashApiKey } from "../../../packages/api/src/auth/hashApiKey.js";
import { AuditEventCrypto } from "../../../packages/crypto/src/AuditEventCrypto.js";

import { ParmanaClient } from "../../src/client/ParmanaClient.js";
import { HttpTransport } from "../../src/transport/HttpTransport.js";
import type { BusinessTransaction } from "../../src/models/index.js";

import { AuthenticationError } from "../../src/errors/AuthenticationError.js";
import { AuthorizationError } from "../../src/errors/AuthorizationError.js";
import { ValidationError } from "../../src/errors/ValidationError.js";
import { ExecutionRejectedError } from "../../src/errors/ExecutionRejectedError.js";
import { NotFoundError } from "../../src/errors/NotFoundError.js";
import { ConflictError } from "../../src/errors/ConflictError.js";
import { withTestApproval } from "../../../test-support/approvals.js";

const RAW_API_KEY = "ts-sdk-integration-test-key";

let server: Server;
let endpoint: string;

function buildTransaction(
  overrides: {
    businessTransactionId?: string;
    riskScore?: number;
    paymentAmount?: number;
    target?: string;
    principalId?: string;
  } = {},
): Promise<BusinessTransaction> {
  const businessTransactionId =
    overrides.businessTransactionId ?? crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();
  const target = overrides.target ?? "vendor/V-ts-sdk";
  const paymentAmount = overrides.paymentAmount ?? 4500;

  // Signed by the hermetic test approver: no agent action is authorized
  // without a signed human approval.
  return withTestApproval({
    businessTransactionId,

    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      tenantId: null,
      sourceSystem: "typescript-sdk-integration-test",
      submittedBy: "vitest",
      submittedAt: now,
    },

    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: overrides.principalId ?? "typescript-sdk-integration-test",
      displayName: "TypeScript SDK Integration Test",
      issuedAt: now,
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: "TypeScript SDK integration test",
      issuedAt: now,
    },

    intent: {
      intentId,
      authorizationId,
      // test:fixture-execute (not payments:execute/vendor-payment, removed
      // per docs/VERIFICATION-GAPS.md G-27) -- registered only when
      // NODE_ENV=test (createTestFixtureConnector.ts). Still governed by
      // the unchanged vendor-payment/2.1.0 policy below.
      action: "test:fixture-execute",
      target,
      parameters: { amount: paymentAmount, currency: "USD" },
      createdAt: now,
    },

    policy: {
      name: "vendor-payment",
      version: "2.1.0",
      schemaVersion: "1.0.0",
    },

    signals: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount,
      riskScore: overrides.riskScore ?? 10,
      // vendor-payment@2.1.0 declares boundSignals: vendorId -> target.
      vendorId: target,
    },

    status: "RECEIVED",
    createdAt: now,
  } as BusinessTransaction);
}

beforeAll(async () => {
  process.env.PARMANA_POLICY_DIR = fileURLToPath(
    new URL("../../../policies", import.meta.url),
  );

  // Deliberately dynamic imports, deferred until after PARMANA_POLICY_DIR
  // above is set. packages/api/src/application.ts constructs its
  // `policyRepository` export as a module-level singleton, reading
  // PARMANA_POLICY_DIR the instant the module is first evaluated. Static
  // top-level imports (as these used to be) run before this beforeAll's
  // own body ever executes -- ES module imports are hoisted and fully
  // evaluated before the importing module's own code runs -- so they
  // would permanently capture whatever PARMANA_POLICY_DIR happened to
  // already be: the repo's own .env sets PARMANA_POLICY_DIR=./policies
  // (relative), which resolves against process.cwd() at the moment
  // dotenv loads it, not against this file's location. Running this
  // suite via `cd typescript && npm test` (cwd = typescript/) previously
  // resolved that to the nonexistent typescript/policies/, producing a
  // live "Policy 'vendor-payment' version '2.0.0' was not found" 404 on
  // every test that reached policy evaluation -- invisible from the repo
  // root (ci.yml's `npm test` runs from there, where the same relative
  // path happens to resolve correctly), but real and reproducible from
  // this package's own conventional `npm test` invocation.
  //
  // `createApp` needs the same deferral: it statically imports
  // ./routes/policies.js, which itself statically imports
  // application.js -- so a static top-level `import { createApp } from
  // ".../app.js"` in this file would transitively evaluate the
  // policyRepository singleton (via application.js's module-level
  // `loadConfig()`) just as early as importing application.js directly,
  // silently reintroducing the exact same bug through a different path.
  const { createApplication } =
    await import("../../../packages/api/src/application.js");
  const { createApp } = await import("../../../packages/api/src/app.js");

  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);

  const authenticator = new StaticKeyAuthenticator([
    {
      callerId: "typescript-sdk-integration-test",
      keyHash: hashApiKey(RAW_API_KEY),
      allowedPrincipalIds: ["typescript-sdk-integration-test"],
      allowedCapabilities: ["test:fixture-execute"],
    },
  ]);

  const app = createApp(application, {
    callerAuth: {
      authenticator,
      auditSink: new InMemoryCallerAuditSink(),
    },
  });

  server = await new Promise<Server>((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => {
      resolve(httpServer);
    });
  });

  const address = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function authenticatedClient(): ParmanaClient {
  return new ParmanaClient({
    endpoint,
    apiKey: RAW_API_KEY,
    transport: new HttpTransport({ endpoint, apiKey: RAW_API_KEY }),
  });
}

function unauthenticatedClient(): ParmanaClient {
  return new ParmanaClient({
    endpoint,
    transport: new HttpTransport({ endpoint }),
  });
}

describe("ParmanaClient against a real local @parmana/api instance", () => {
  describe("gap 1: bearer-key authentication", () => {
    it("GET /health succeeds with no apiKey (the one route exempt from auth)", async () => {
      const health = await unauthenticatedClient().health();
      expect(health).toMatchObject({ status: "UP" });
    });

    it("an authenticated request succeeds", async () => {
      const transaction = await buildTransaction();
      const trustRecord = await authenticatedClient().execute(transaction);

      expect(trustRecord.businessTransactionId).toBe(
        transaction.businessTransactionId,
      );
      expect(trustRecord.executions).toHaveLength(1);
      expect(trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");
    });

    it("a caller asserting a principalId it is not allowed to assert gets a real 403, thrown as AuthorizationError", async () => {
      const transaction = await buildTransaction({
        principalId: "someone-else-entirely",
      });

      let caught: unknown;
      try {
        await authenticatedClient().execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(AuthorizationError);
      expect((caught as AuthorizationError).message).toBe(
        "Caller is not permitted to assert this authority.principalId.",
      );
    });

    it("an unauthenticated request against a route that requires auth gets a real 401, thrown as AuthenticationError", async () => {
      let caught: unknown;
      try {
        await unauthenticatedClient().execute(await buildTransaction());
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(AuthenticationError);
      expect((caught as AuthenticationError).message).toBe(
        "authentication required",
      );
    });
  });

  describe("gap 2: real errors map to the correct typed error", () => {
    it("a real validation error (malformed businessTransactionId) throws ValidationError with the server's exact message", async () => {
      const transaction = await buildTransaction();
      const malformed = {
        ...transaction,
        businessTransactionId: "not-a-uuid",
      };

      let caught: unknown;
      try {
        await authenticatedClient().execute(malformed);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as ValidationError).message).toBe(
        "businessTransactionId must be a valid UUID.",
      );
    });

    it("a real policy rejection (riskScore over threshold) throws ExecutionRejectedError with the policy's real reason", async () => {
      const transaction = await buildTransaction({ riskScore: 999 });

      let caught: unknown;
      try {
        await authenticatedClient().execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ExecutionRejectedError);
      expect((caught as ExecutionRejectedError).message).toBe(
        "Execution rejected: Vendor payment rejected because the assessed payment risk exceeds the maximum permitted threshold.",
      );
    });

    it("a real not-found (unknown Execution Trust Record) throws NotFoundError", async () => {
      let caught: unknown;
      try {
        await authenticatedClient().trustRecord(crypto.randomUUID());
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundError);
      expect((caught as NotFoundError).message).toBe(
        "Execution Trust Record not found.",
      );
    });

    it("a real duplicate businessTransactionId throws ConflictError", async () => {
      const transaction = await buildTransaction();
      const client = authenticatedClient();

      await client.execute(transaction);

      let caught: unknown;
      try {
        await client.execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ConflictError);
      expect((caught as ConflictError).message).toBe(
        `Business Transaction '${transaction.businessTransactionId}' already exists.`,
      );
    });
  });

  describe("completeness gaps closed this audit: version(), verify(), createTransaction()", () => {
    it("version() returns the real GET /version payload", async () => {
      const version = await authenticatedClient().version();
      expect(version).toMatchObject({ name: "Parmana", api: "v1" });
    });

    it("verify() runs a fresh POST /verify and appends a new Verification", async () => {
      const transaction = await buildTransaction();
      const client = authenticatedClient();

      const trustRecord = await client.execute(transaction);
      expect(trustRecord.verifications).toHaveLength(1);

      const verification = await client.verify(
        transaction.businessTransactionId,
      );

      expect(verification.status).toBe("VERIFIED");
      expect(verification.businessTransactionId).toBe(
        transaction.businessTransactionId,
      );

      const trustRecordAfter = await client.trustRecord(
        transaction.businessTransactionId,
      );
      expect(trustRecordAfter.verifications).toHaveLength(2);
    });

    it("createTransaction() executes via POST /transactions with a 201, identical pipeline to execute()", async () => {
      const transaction = await buildTransaction();

      const trustRecord =
        await authenticatedClient().createTransaction(transaction);

      expect(trustRecord.businessTransactionId).toBe(
        transaction.businessTransactionId,
      );
      expect(trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");

      // status/createdAt supplied by the client are always ignored;
      // Parmana assigns RECEIVED and the current server time.
      expect(trustRecord.transaction.status).toBe("RECEIVED");
    });
  });

  describe("gap closed this audit: Refusal Record and audit-event verification coverage (RFC-0021)", () => {
    it("a real policy-rejected transaction produces a Refusal Record, readable and independently verifiable", async () => {
      const transaction = await buildTransaction({ riskScore: 999 });
      const client = authenticatedClient();

      let caught: unknown;
      try {
        await client.execute(transaction);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ExecutionRejectedError);

      const refusalRecord = await client.refusalRecord(
        transaction.businessTransactionId,
      );
      expect(refusalRecord.businessTransactionId).toBe(
        transaction.businessTransactionId,
      );
      expect(refusalRecord.decision.outcome).toBe("REJECTED");

      expect(await client.verifyRefusalRecord(refusalRecord)).toBe(true);
    });

    it("an unauthenticated caller can still verify a Refusal Record -- POST /refusal/verify is exempt from caller-auth by design", async () => {
      const transaction = await buildTransaction({ riskScore: 999 });
      const client = authenticatedClient();

      try {
        await client.execute(transaction);
      } catch {
        // Expected: this transaction is deliberately built to be
        // policy-rejected. The resulting Refusal Record is this
        // test's real subject, not the rejection itself (already
        // covered above).
      }

      const refusalRecord = await client.refusalRecord(
        transaction.businessTransactionId,
      );

      expect(
        await unauthenticatedClient().verifyRefusalRecord(refusalRecord),
      ).toBe(true);
    });

    it("a tampered Refusal Record fails verification against the real server", async () => {
      const transaction = await buildTransaction({ riskScore: 999 });
      const client = authenticatedClient();

      try {
        await client.execute(transaction);
      } catch {
        // Expected: see above.
      }

      const refusalRecord = await client.refusalRecord(
        transaction.businessTransactionId,
      );

      const tampered = {
        ...refusalRecord,
        decision: {
          ...refusalRecord.decision,
          reason: "tampered after the fact",
        },
      };

      expect(await client.verifyRefusalRecord(tampered)).toBe(false);
    });

    it("verifies a genuinely signed audit event against the real running server", async () => {
      const event = {
        type: "caller.authenticated",
        occurredAt: new Date().toISOString(),
        route: "/execute",
        callerId: "typescript-sdk-integration-test",
      };

      // Signed here with the exact same key material
      // (FileKeyProvider/DEFAULT_KEY_ID) the live server this test
      // drives resolves for itself -- both run in this same process,
      // so this is a genuine round trip through the real POST
      // /audit/verify route, not a mock of AuditEventCrypto.
      const signature = await new AuditEventCrypto().sign(event);

      expect(
        await unauthenticatedClient().verifyAuditEvent(event, signature),
      ).toBe(true);
    });

    it("a tampered audit event fails verification against the real server", async () => {
      const event = {
        type: "caller.rejected",
        occurredAt: new Date().toISOString(),
        route: "/execute",
        reason: "invalid credential",
      };

      const signature = await new AuditEventCrypto().sign(event);

      const tampered = { ...event, reason: "tampered after the fact" };

      expect(
        await unauthenticatedClient().verifyAuditEvent(tampered, signature),
      ).toBe(false);
    });
  });
});
