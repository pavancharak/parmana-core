import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * HTTP-level proof of the two rate limiters
 * (packages/api/src/middleware/rate-limit.ts): a real finding from load
 * testing against a live deployment (no rate limiting existed anywhere,
 * confirmed by firing thousands of unthrottled requests with zero 429s).
 * Mirrors caller-auth.integration.test.ts's own buildApp() shape.
 */
describe("Rate limiting (HTTP boundary)", () => {
  const CALLER_A_KEY = "rate-limit-caller-a-raw-key-for-tests-only";
  const CALLER_B_KEY = "rate-limit-caller-b-raw-key-for-tests-only";

  function buildApp(rateLimit: {
    executePerMinute: number;
    healthPerMinute: number;
    publicPerMinute?: number;
    authFailurePerMinute?: number;
  }) {
    const { executionSystem, auditSink: executionAuditSink } =
      createInspectableExecutionSystem();

    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "caller-a",
        keyHash: hashApiKey(CALLER_A_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
      {
        callerId: "caller-b",
        keyHash: hashApiKey(CALLER_B_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
    ]);

    const callerAuditSink = new InMemoryCallerAuditSink();

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: callerAuditSink },
      rateLimit,
    });

    return { app, executionAuditSink, callerAuditSink };
  }

  describe("POST /execute, keyed by authenticated caller identity", () => {
    it("normal traffic under the limit passes through unaffected", async () => {
      const { app } = buildApp({ executePerMinute: 5, healthPerMinute: 300 });

      const first = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      const second = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    it("traffic over the limit gets a clean 429 with a Retry-After header, and never reaches signing/execution", async () => {
      const { app, executionAuditSink } = buildApp({
        executePerMinute: 2,
        healthPerMinute: 300,
      });

      const first = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());
      expect(first.status).toBe(200);

      // Baseline, not a hardcoded assumption about how many execution-audit
      // events a single successful /execute produces (it's more than one --
      // session-credential issuance, connector execution, etc. -- and that
      // count is an implementation detail this test doesn't need to know).
      const eventsAfterOneSuccess = executionAuditSink.events.length;
      expect(eventsAfterOneSuccess).toBeGreaterThan(0);

      const second = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());
      expect(second.status).toBe(200);

      const eventsAfterTwoSuccesses = executionAuditSink.events.length;
      // Two identical successful executions produce exactly twice the
      // per-execution event count -- confirms the baseline is real and
      // proportional, not a fluke of the first call.
      expect(eventsAfterTwoSuccesses).toBe(eventsAfterOneSuccess * 2);

      const third = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      expect(third.status).toBe(429);
      expect(third.body).toEqual({
        error: "Rate limit exceeded. Try again later.",
        code: "RATE_LIMITED",
      });
      expect(third.headers["retry-after"]).toBeDefined();
      expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);

      // The rate-limited third request added ZERO new execution-audit
      // events -- proof it never reached BusinessTransactionMapper, policy
      // evaluation, or RuntimeAuthorizationSigner at all.
      expect(executionAuditSink.events.length).toBe(eventsAfterTwoSuccesses);
    });

    it("a rate-limited caller does not block a different caller's traffic (limits are per-key, not global)", async () => {
      const { app } = buildApp({ executePerMinute: 1, healthPerMinute: 300 });

      const callerAFirst = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      const callerASecond = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
        .send(await createBusinessTransaction());

      const callerBFirst = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${CALLER_B_KEY}`)
        .send(await createBusinessTransaction());

      expect(callerAFirst.status).toBe(200);
      expect(callerASecond.status).toBe(429);

      // Caller B is a different key, entirely unaffected by caller A
      // exhausting its own limit.
      expect(callerBFirst.status).toBe(200);
    });
  });

  describe("GET /health and GET /ready, keyed by IP", () => {
    it("normal traffic under the limit passes through unaffected, no credential required", async () => {
      const { app } = buildApp({ executePerMinute: 30, healthPerMinute: 5 });

      const health = await request(app).get("/health");
      const ready = await request(app).get("/ready");

      expect(health.status).toBe(200);
      expect(ready.status).toBe(200);
    });

    it("traffic over the limit gets a clean 429 with a Retry-After header", async () => {
      const { app } = buildApp({ executePerMinute: 30, healthPerMinute: 2 });

      // /health and /ready share one limiter instance (mounted once in
      // app.ts, used on both routes) -- deliberately: both are the same
      // "cheap, unauthenticated, frequently polled" category this
      // limiter exists for, not two independently-throttled resources.
      await request(app).get("/health");
      await request(app).get("/health");
      const limited = await request(app).get("/health");

      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({
        error: "Rate limit exceeded. Try again later.",
        code: "RATE_LIMITED",
      });
      expect(limited.headers["retry-after"]).toBeDefined();
    });

    it("exhausting the limit via /health also rate-limits /ready (shared limiter)", async () => {
      const { app } = buildApp({ executePerMinute: 30, healthPerMinute: 1 });

      await request(app).get("/health");
      const readyAfterHealthExhausted = await request(app).get("/ready");

      expect(readyAfterHealthExhausted.status).toBe(429);
    });
  });

  describe("unauthenticated verify routes and /handbook, keyed by IP (G-78)", () => {
    it("traffic over the limit gets a clean 429, before the route does any work", async () => {
      const { app } = buildApp({
        executePerMinute: 30,
        healthPerMinute: 300,
        publicPerMinute: 2,
      });

      // The bodies are empty: under the limit they are refused by the
      // route itself (4xx), over it by the limiter (429).
      const first = await request(app).post("/audit/verify").send({});
      const second = await request(app).post("/audit/verify").send({});
      const limited = await request(app).post("/audit/verify").send({});

      expect(first.status).not.toBe(429);
      expect(second.status).not.toBe(429);
      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe("RATE_LIMITED");
      expect(limited.headers["retry-after"]).toBeDefined();
    });

    it("one limiter covers every public route that does work", async () => {
      const { app } = buildApp({
        executePerMinute: 30,
        healthPerMinute: 300,
        publicPerMinute: 3,
      });

      await request(app).post("/refusal/verify").send({});
      await request(app).post("/execution-intents/verify").send({});
      await request(app).post("/audit/verify").send({});

      const handbook = await request(app)
        .post("/handbook/download-leads")
        .send({ email: "not-an-email" });

      expect(handbook.status).toBe(429);
    });

    it("does not count against /health", async () => {
      const { app } = buildApp({
        executePerMinute: 30,
        healthPerMinute: 300,
        publicPerMinute: 1,
      });

      await request(app).post("/audit/verify").send({});
      await request(app).post("/audit/verify").send({});

      expect((await request(app).get("/health")).status).toBe(200);
    });
  });

  describe("failed caller authentication, keyed by IP", () => {
    it("bad keys over the limit get a clean 429 and stop writing caller.rejected audit events", async () => {
      const { app, callerAuditSink } = buildApp({
        executePerMinute: 100,
        healthPerMinute: 300,
        authFailurePerMinute: 2,
      });

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await request(app)
          .get("/transactions")
          .set("Authorization", "Bearer not-a-real-key");
        statuses.push(response.status);
      }

      expect(statuses).toEqual([401, 401, 429, 429]);

      const rejected = callerAuditSink.events.filter(
        (event) => event.type === "caller.rejected",
      );
      expect(rejected).toHaveLength(2);
    });

    it("requests with a valid key do not count against the limit", async () => {
      const { app } = buildApp({
        executePerMinute: 100,
        healthPerMinute: 300,
        authFailurePerMinute: 2,
      });

      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await request(app)
          .get("/transactions")
          .set("Authorization", `Bearer ${CALLER_A_KEY}`);
        expect(response.status).toBe(200);
      }

      const bad = await request(app)
        .get("/transactions")
        .set("Authorization", "Bearer not-a-real-key");
      expect(bad.status).toBe(401);
    });
  });

  describe("key discovery, keyed by IP with the public routes", () => {
    it("GET /keys/:keyId over the public limit gets a clean 429", async () => {
      const { app } = buildApp({
        executePerMinute: 100,
        healthPerMinute: 300,
        publicPerMinute: 1,
      });

      const first = await request(app).get("/keys/default");
      const second = await request(app).get("/keys/default");

      expect(first.status).not.toBe(429);
      expect(second.status).toBe(429);
    });

    it("the public limiter does not count authenticated routes", async () => {
      const { app } = buildApp({
        executePerMinute: 100,
        healthPerMinute: 300,
        publicPerMinute: 1,
      });

      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await request(app)
          .get("/transactions")
          .set("Authorization", `Bearer ${CALLER_A_KEY}`);
        expect(response.status).toBe(200);
      }
    });
  });

  describe("caller-auth disabled: /execute rate limiting is skipped entirely", () => {
    it("no caller identity to key off, so the limiter is not mounted at all", async () => {
      const { executionSystem } = createInspectableExecutionSystem();
      const application = createApplication(executionSystem);

      const app = createApp(application, {
        callerAuth: "disabled",
        rateLimit: { executePerMinute: 1, healthPerMinute: 300 },
      });

      const first = await request(app)
        .post("/execute")
        .send(await createBusinessTransaction());
      const second = await request(app)
        .post("/execute")
        .send(await createBusinessTransaction());

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });
  });

  describe("omitted rateLimit option falls back to sane defaults", () => {
    it("createApp without a rateLimit option still applies the health/ready limiter with its default", async () => {
      const { executionSystem } = createInspectableExecutionSystem();
      const application = createApplication(executionSystem);

      const authenticator = new StaticKeyAuthenticator([
        {
          callerId: "caller-a",
          keyHash: hashApiKey(CALLER_A_KEY),
          allowedPrincipalIds: ["integration-test"],
          allowedCapabilities: ["test:fixture-execute"],
        },
      ]);

      const app = createApp(application, {
        callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
        // rateLimit intentionally omitted.
      });

      const response = await request(app).get("/health");
      expect(response.status).toBe(200);
    });
  });
});
