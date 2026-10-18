import { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessTransaction, SignedApproval } from "@parmana/shared";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";
import {
  GITHUB_TEST_MODE_PLACEHOLDER_TOKEN,
  MockGitHubServer,
} from "@parmana/connector-github";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

//
// One trusted approver for this file only, the same way
// paytm-refund.integration.test.ts does it: github-pr-approval 1.1.0
// (G-73) authorizes a merge only with a signed approval for that pull
// request.
//
const approver = vi.hoisted(() => ({
  approverId: "reviewer-asha",
  keyId: "reviewer-asha-key-1",
}));

const approverKeys = generateKeyPairSync("ed25519");

vi.mock("../../src/bootstrap/createApprovalIssuerRegistry.js", () => ({
  createApprovalIssuerRegistry: () =>
    new StaticApprovalIssuerRegistry([
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        publicKey: approverKeys.publicKey,
        revoked: false,
      },
    ]),
}));

/**
 * HTTP-level proof that the GitHub PR-merge connector is reachable
 * through the real, production-wired API -- not only through unit tests
 * (packages/connector-github/tests/unit/*.test.ts and
 * packages/execution-gateway/tests/unit/github-*.test.ts).
 *
 * Uses the same real production bootstrap chain server.ts calls
 * (createExecutionSystem -> createExecutionGateway ->
 * createExecutionControl -> createConnectorRegistry), pointed at a
 * hermetic MockGitHubServer via the GITHUB_BASE_URL test seam (see
 * createGitHubConnector.ts) instead of a hand-rolled recomposition, so
 * this proves the actual production wiring -- not a look-alike of it.
 * Mirrors hubspot-deal-update.integration.test.ts's own header comment.
 *
 * Credential resolution goes through the real GitHubAppCredentialProvider
 * too (createGitHubCredentialProvider.ts's NODE_ENV=test fallback: a
 * freshly generated RSA keypair, since MockGitHubServer's
 * access_tokens endpoint never verifies the JWT signature) -- so this is
 * the one place in the suite that exercises the full ephemeral-credential
 * mint -> merge round trip end to end, not just a static test token.
 *
 * The policy-denial case below is this milestone's "policy-denial-makes-
 * zero-calls" proof, asserted the same way
 * hubspot-deal-update.integration.test.ts's own denial tests assert it.
 */
describe("GitHub PR merge (HTTP boundary)", () => {
  let server: MockGitHubServer | undefined;
  const originalGitHubBaseUrl = process.env.GITHUB_BASE_URL;

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (originalGitHubBaseUrl === undefined) {
      delete process.env.GITHUB_BASE_URL;
    } else {
      process.env.GITHUB_BASE_URL = originalGitHubBaseUrl;
    }
  });

  const INSTALLATION_TOKEN = "test-mock-installation-token-a1b2c3d4e5f6";

  async function buildApp(): Promise<{
    app: ReturnType<typeof createApp>;
    server: MockGitHubServer;
  }> {
    const mockServer = new MockGitHubServer({
      installationToken: INSTALLATION_TOKEN,
    });
    await mockServer.listen();
    server = mockServer;

    process.env.GITHUB_BASE_URL = mockServer.baseUrl;

    const executionSystem = await createExecutionSystem();
    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    return { app, server: mockServer };
  }

  function prApprovalTransaction(overrides: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod?: string;
    signals: BusinessTransaction["signals"];
  }): BusinessTransaction {
    const businessTransactionId = crypto.randomUUID();
    const authorityId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const intentId = crypto.randomUUID();

    return {
      businessTransactionId,

      metadata: {
        businessTransactionId,
        correlationId: crypto.randomUUID(),
        createdBy: "integration-test",
        createdAt: new Date(),
      },

      authority: {
        authorityId,
        authorityType: "USER",
        principalId: "integration-test",
        displayName: "Integration Test",
        issuedAt: new Date(),
      },

      authorization: {
        authorizationId,
        authorityId,
        purpose: "Integration Test",
        authorizedAt: new Date(),
      },

      intent: {
        intentId,
        authorizationId,
        action: "github:pr-merge",
        target: `${overrides.owner}/${overrides.repo}#${overrides.pullNumber}`,
        parameters: Object.freeze({
          mergeMethod: overrides.mergeMethod ?? "squash",
        }),
        createdAt: new Date(),
      },

      policy: {
        name: "github-pr-approval",
        version: "1.1.0",
        schemaVersion: "1.0.0",
      },

      signals: overrides.signals,

      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;
  }

  async function signMergeApproval(
    pullRequest: string,
  ): Promise<SignedApproval> {
    return new ApprovalArtifactSigner().sign(
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        capability: "github:pr-merge",
        resourceId: pullRequest,
        scope: { field: "resourceId", comparator: "eq", value: pullRequest },
        ttlSeconds: 900,
      },
      approverKeys.privateKey,
    );
  }

  function mergeSignals(
    overrides: Record<string, unknown>,
    approval?: SignedApproval,
  ): BusinessTransaction["signals"] {
    return {
      mergeApproved: true,
      repositoryAuthorized: true,
      requiredReviewsCompleted: true,
      statusChecksPassed: true,
      branchProtected: true,
      riskScore: 5,
      ...overrides,
      ...(approval !== undefined
        ? { approvalArtifact: JSON.parse(JSON.stringify(approval)) }
        : {}),
    } as BusinessTransaction["signals"];
  }

  it("authorizes and executes a real PR merge through POST /execute, landing on the mock GitHub server", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPullRequest("acme", "widgets", {
      number: 42,
      mergeable: true,
      mergedAt: null,
      headSha: "abc123",
      baseRef: "main",
    });

    const transaction = prApprovalTransaction({
      owner: "acme",
      repo: "widgets",
      pullNumber: 42,
      signals: mergeSignals({}, await signMergeApproval("acme/widgets#42")),
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);

    // The strongest proof this went through the real HTTP surface end to
    // end: the PR actually merged on the (mock) GitHub server, not just
    // that the API returned 200.
    expect(
      mockServer.getPullRequest("acme", "widgets", 42)?.mergedAt,
    ).not.toBeNull();
    expect(mockServer.mergeCalls).toBe(1);
  });

  it("rejects by policy through POST /execute and never calls GitHub when required status checks have not passed", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPullRequest("acme", "widgets", {
      number: 43,
      mergeable: true,
      mergedAt: null,
      headSha: "def456",
      baseRef: "main",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = prApprovalTransaction({
      owner: "acme",
      repo: "widgets",
      pullNumber: 43,
      signals: mergeSignals(
        { statusChecksPassed: false },
        await signMergeApproval("acme/widgets#43"),
      ),
    });

    const response = await request(app).post("/execute").send(transaction);

    // A policy denial is a deliberate, correct rejection -- 403, distinct
    // from a genuine server error (500) or a replayed authorization (409).
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");

    // The PR is untouched on GitHub's (mock) side.
    expect(
      mockServer.getPullRequest("acme", "widgets", 43)?.mergedAt,
    ).toBeNull();
    expect(mockServer.mergeCalls).toBe(0);

    // The strongest possible proof of "zero GitHub API calls": not even a
    // network call was made to the mock server for this denial -- not the
    // merge, and not even the credential-mint (access_tokens) exchange --
    // the policy REJECTED decision is caught in ExecutionGate.enforce
    // before ExecutionComponent ever dispatches to the connector or
    // resolves a credential.
    const gitHubCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith(mockServer.baseUrl),
    );
    expect(gitHubCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it("rejects by policy through POST /execute and never calls GitHub when the assessed risk exceeds the threshold", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPullRequest("acme", "widgets", {
      number: 44,
      mergeable: true,
      mergedAt: null,
      headSha: "ghi789",
      baseRef: "main",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = prApprovalTransaction({
      owner: "acme",
      repo: "widgets",
      pullNumber: 44,
      signals: mergeSignals(
        { riskScore: 85 },
        await signMergeApproval("acme/widgets#44"),
      ),
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");

    expect(
      mockServer.getPullRequest("acme", "widgets", 44)?.mergedAt,
    ).toBeNull();

    const gitHubCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith(mockServer.baseUrl),
    );
    expect(gitHubCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  describe("a merge needs a signed approval (G-73)", () => {
    it.each([
      [
        "every caller declared fact true, mergeApproved false",
        { mergeApproved: false },
      ],
      ["mergeApproved true with no approval attached", {}],
    ])("rejects %s and never calls GitHub", async (_name, overrides) => {
      const { app, server: mockServer } = await buildApp();

      mockServer.setPullRequest("acme", "widgets", {
        number: 46,
        mergeable: true,
        mergedAt: null,
        headSha: "mno345",
        baseRef: "main",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await request(app)
        .post("/execute")
        .send(
          prApprovalTransaction({
            owner: "acme",
            repo: "widgets",
            pullNumber: 46,
            signals: mergeSignals(overrides),
          }),
        );

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("POLICY_DENIED");
      expect(mockServer.mergeCalls).toBe(0);
      expect(
        fetchSpy.mock.calls.filter((call) =>
          String(call[0]).startsWith(mockServer.baseUrl),
        ),
      ).toHaveLength(0);

      fetchSpy.mockRestore();
    });

    it("rejects an approval signed for a different pull request", async () => {
      const { app, server: mockServer } = await buildApp();

      mockServer.setPullRequest("acme", "widgets", {
        number: 47,
        mergeable: true,
        mergedAt: null,
        headSha: "pqr678",
        baseRef: "main",
      });

      const response = await request(app)
        .post("/execute")
        .send(
          prApprovalTransaction({
            owner: "acme",
            repo: "widgets",
            pullNumber: 47,
            signals: mergeSignals(
              {},
              await signMergeApproval("acme/widgets#99"),
            ),
          }),
        );

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("POLICY_DENIED");
      expect(mockServer.mergeCalls).toBe(0);
    });

    it("accepts an approval once: the same approval on a new request is rejected", async () => {
      const { app, server: mockServer } = await buildApp();

      mockServer.setPullRequest("acme", "widgets", {
        number: 48,
        mergeable: true,
        mergedAt: null,
        headSha: "stu901",
        baseRef: "main",
      });

      const approval = await signMergeApproval("acme/widgets#48");

      const first = await request(app)
        .post("/execute")
        .send(
          prApprovalTransaction({
            owner: "acme",
            repo: "widgets",
            pullNumber: 48,
            signals: mergeSignals({}, approval),
          }),
        );

      expect(first.status).toBe(200);

      const second = await request(app)
        .post("/execute")
        .send(
          prApprovalTransaction({
            owner: "acme",
            repo: "widgets",
            pullNumber: 48,
            signals: mergeSignals({}, approval),
          }),
        );

      expect(second.status).toBe(403);
      expect(mockServer.mergeCalls).toBe(1);
    });
  });

  it("never places the installation token or the App private key in the /execute response, only a one-way fingerprint", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPullRequest("acme", "widgets", {
      number: 45,
      mergeable: true,
      mergedAt: null,
      headSha: "jkl012",
      baseRef: "main",
    });

    const transaction = prApprovalTransaction({
      owner: "acme",
      repo: "widgets",
      pullNumber: 45,
      signals: mergeSignals({}, await signMergeApproval("acme/widgets#45")),
    });

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(INSTALLATION_TOKEN);
    expect(serialized).not.toContain("-----BEGIN");
    expect(serialized).not.toContain(GITHUB_TEST_MODE_PLACEHOLDER_TOKEN);
  });
});
