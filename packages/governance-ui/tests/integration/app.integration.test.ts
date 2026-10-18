import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createGovernanceUiApp } from "../../src/app.js";

const API_BASE_URL = "http://api.example";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_IDENTITY = {
  callerId: "human-checker-1",
  allowedPrincipalIds: [],
  allowedCapabilities: [],
  unrestrictedCapabilities: false,
};

const PENDING_CHANGE = {
  pendingPolicyChangeId: "ppc-1",
  policyName: "vendor-payment",
  policyVersion: "2.0.0",
  proposedContent: { policyId: "vendor-payment", policyVersion: "2.0.0" },
  proposedBy: "human-maker",
  proposedAt: "2026-08-01T00:00:00.000Z",
  status: "PENDING_APPROVAL",
  reason: "raise the approval threshold",
  diff: {
    current: { policyId: "vendor-payment", policyVersion: "2.0.0", rules: [] },
    proposed: {
      policyId: "vendor-payment",
      policyVersion: "2.0.0",
      rules: ["new"],
    },
  },
};

/**
 * Stubs the two upstream @parmana/api endpoints this UI calls,
 * dispatching on the request URL -- these tests exercise the UI's own
 * routing/session/rendering logic, never a real packages/api process
 * (see the package README for the separate manual smoke check that
 * does run against a real instance).
 */
function stubApi(options: {
  identity?: Response | (() => Response);
  changes?: Response | (() => Response);
}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;

    if (url.endsWith("/callers/me")) {
      return typeof options.identity === "function"
        ? options.identity()
        : (options.identity ?? jsonResponse(200, VALID_IDENTITY));
    }

    if (url.includes("/policies/pending-changes")) {
      return typeof options.changes === "function"
        ? options.changes()
        : (options.changes ?? jsonResponse(200, { changes: [PENDING_CHANGE] }));
    }

    throw new Error(`Unexpected fetch to ${url}`);
  });
}

function buildApp() {
  return createGovernanceUiApp({
    apiBaseUrl: API_BASE_URL,
    sessionSecret: "test-secret",
    isProduction: false,
  });
}

describe("governance-ui app", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects an unauthenticated request to /login", async () => {
    const app = buildApp();

    const response = await request(app).get("/");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login");
  });

  it("renders the login form on GET /login", async () => {
    const app = buildApp();

    const response = await request(app).get("/login");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Parmana API key");
  });

  it("rejects an invalid key with 401 and does not set a session", async () => {
    const app = buildApp();
    stubApi({ identity: jsonResponse(401, { error: "Invalid API key." }) });

    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/login")
      .type("form")
      .send({ apiKey: "bad-key" });

    expect(loginResponse.status).toBe(401);
    expect(loginResponse.text).toContain("Invalid API key");

    const listResponse = await agent.get("/");
    expect(listResponse.status).toBe(302);
    expect(listResponse.headers.location).toBe("/login");
  });

  it("rate-limits repeated POST /login attempts (brute-force protection)", async () => {
    const app = buildApp();
    stubApi({ identity: jsonResponse(401, { error: "Invalid API key." }) });

    const agent = request.agent(app);

    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await agent
        .post("/login")
        .type("form")
        .send({ apiKey: `bad-key-${attempt}` });
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
  });

  it("logs in with a valid key, then lists pending changes", async () => {
    const app = buildApp();
    stubApi({});

    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/login")
      .type("form")
      .send({ apiKey: "good-key" });

    expect(loginResponse.status).toBe(302);
    expect(loginResponse.headers.location).toBe("/");

    const listResponse = await agent.get("/");

    expect(listResponse.status).toBe(200);
    expect(listResponse.text).toContain("vendor-payment");
    expect(listResponse.text).toContain("human-maker");
    expect(listResponse.text).toContain("Signed in as");
    expect(listResponse.text).toContain("human-checker-1");
  });

  it("shows the diff view with before/after panels and the CLI/curl instructions", async () => {
    const app = buildApp();
    stubApi({});

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ apiKey: "good-key" });

    const response = await agent.get("/pending-changes/ppc-1");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Current");
    expect(response.text).toContain("Proposed");
    expect(response.text).toContain("sign-policy-change-step-up.ts");
    expect(response.text).toContain("--pending-policy-change-id ppc-1");
    expect(response.text).toContain(
      `${API_BASE_URL}/policies/pending-changes/ppc-1/approve`,
    );

    // The whole point of this page: no approve/reject controls -- the
    // page's only <form> is the shared layout's logout button, which
    // posts to /logout, never to /approve or /reject.
    expect(response.text).not.toContain('action="/pending-changes');
    expect(response.text).not.toMatch(/action="[^"]*\/(approve|reject)"/);
    expect(response.text.toLowerCase()).not.toContain('name="action"');
  });

  it("does not show approve/reject instructions for an already-resolved change", async () => {
    const app = buildApp();
    stubApi({
      changes: jsonResponse(200, {
        changes: [
          {
            ...PENDING_CHANGE,
            status: "APPROVED",
            resolvedBy: "human-checker-1",
            resolvedAt: "2026-08-02T00:00:00.000Z",
          },
        ],
      }),
    });

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ apiKey: "good-key" });

    const response = await agent.get("/pending-changes/ppc-1");

    expect(response.status).toBe(200);
    expect(response.text).not.toContain("sign-policy-change-step-up.ts");
  });

  it("returns 404 for an unknown pending change id", async () => {
    const app = buildApp();
    stubApi({});

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ apiKey: "good-key" });

    const response = await agent.get("/pending-changes/does-not-exist");

    expect(response.status).toBe(404);
  });

  it("escapes attacker-controlled content (reason, proposer) rather than rendering it raw", async () => {
    const app = buildApp();
    stubApi({
      changes: jsonResponse(200, {
        changes: [
          {
            ...PENDING_CHANGE,
            reason: "<script>alert(1)</script>",
            proposedBy: "<img src=x onerror=alert(1)>",
          },
        ],
      }),
    });

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ apiKey: "good-key" });

    const response = await agent.get("/");

    expect(response.text).not.toContain("<script>alert(1)</script>");
    expect(response.text).toContain("&lt;script&gt;");
    expect(response.text).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("clears the session and redirects to /login when the API reports the key is no longer valid", async () => {
    const app = buildApp();
    const fetchSpy = stubApi({});

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ apiKey: "good-key" });

    fetchSpy.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("/policies/pending-changes")) {
        return jsonResponse(401, { error: "revoked" });
      }

      return jsonResponse(200, VALID_IDENTITY);
    });

    const response = await agent.get("/");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login");

    const afterResponse = await agent.get("/");
    expect(afterResponse.status).toBe(302);
    expect(afterResponse.headers.location).toBe("/login");
  });

  it("logs out and requires re-authentication afterward", async () => {
    const app = buildApp();
    stubApi({});

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ apiKey: "good-key" });

    const logoutResponse = await agent.post("/logout");
    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.location).toBe("/login");

    const listResponse = await agent.get("/");
    expect(listResponse.status).toBe(302);
    expect(listResponse.headers.location).toBe("/login");
  });

  it("shows a distinct message when the API is unreachable", async () => {
    const app = buildApp();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await request(app)
      .post("/login")
      .type("form")
      .send({ apiKey: "any-key" });

    expect(response.status).toBe(502);
    expect(response.text).toContain("Could not reach the Parmana API");
  });
});
