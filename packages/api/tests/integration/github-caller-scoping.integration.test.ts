import { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessTransaction } from "@parmana/shared";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";
import { MockGitHubServer } from "@parmana/connector-github";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { withTestApproval } from "../../../../test-support/approvals.js";

//
// A merge needs a signed approval for the pull request
// (github-pr-approval 1.1.0, G-73), so this file trusts one approver.
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
 * HTTP-level proof that caller-to-capability scoping (docs/CLAIMS.md §3.16,
 * isCapabilityAllowed.ts) actually protects the GitHub connector -- the real
 * production bootstrap chain (createExecutionSystem -> createConnectorRegistry
 * -> the real github:pr-fetch/github:pr-merge capabilities), with caller-auth
 * actually turned ON, unlike github-pr-merge.integration.test.ts's own
 * `callerAuth: "disabled"` (that file exists to prove the merge mechanism
 * itself works; this file exists to prove a scoped caller can be *stopped*
 * from using it).
 *
 * Closes the specific docs/CLAIMS.md §4 [FUTURE] item this milestone is
 * about: "Caller-auth enabled on the HubSpot and GitHub connector integration
 * paths: not started." This is that start, for GitHub. It does not flip a
 * connector-level "callerAuth" flag -- no such flag exists on any connector.
 * callerAuth is a single, app-wide `createApp` option
 * (packages/api/src/app.ts's `AppOptions.callerAuth`); "enabling" it for
 * GitHub means constructing the app with a real authenticator instead of
 * "disabled", which is exactly what buildApp() below does.
 *
 * Entirely hermetic: MockGitHubServer, no live GitHub credentials, no live
 * server, no real PR anywhere. See docs/CLAIMS.md 3.16 for why
 * this is the honest, buildable version of the three-scenarios ask --
 * "live curl against parmana-prod" was not attempted (no such server exists
 * in this environment, and packages/connector-github/README.md's own
 * confirmed state is that GITHUB_APP_PRIVATE_KEY in this checkout's .env is
 * a 32-character placeholder, not a usable PEM key).
 */
describe("GitHub caller-to-capability scoping (HTTP boundary, caller-auth enabled)", () => {
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

  const INSTALLATION_TOKEN = "test-mock-installation-token-caller-scoping";

  const FETCH_ONLY_KEY = "github-scoping-fetch-only-raw-key-for-tests-only";
  const UNRESTRICTED_KEY = "github-scoping-unrestricted-raw-key-for-tests-only";

  async function buildApp(): Promise<{
    app: ReturnType<typeof createApp>;
    server: MockGitHubServer;
    auditSink: InMemoryCallerAuditSink;
  }> {
    const mockServer = new MockGitHubServer({
      installationToken: INSTALLATION_TOKEN,
    });
    await mockServer.listen();
    server = mockServer;

    process.env.GITHUB_BASE_URL = mockServer.baseUrl;

    const executionSystem = await createExecutionSystem();
    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "fca-fetch-only-caller",
        keyHash: hashApiKey(FETCH_ONLY_KEY),
        allowedPrincipalIds: ["integration-test"],
        // Narrowest real scope: read-only, matching
        // the recommendation in docs/CLAIMS.md 3.16.
        allowedCapabilities: ["github:pr-fetch"],
      },
      {
        callerId: "fca-unrestricted-caller",
        keyHash: hashApiKey(UNRESTRICTED_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["github:pr-fetch", "github:pr-merge"],
      },
    ]);

    const auditSink = new InMemoryCallerAuditSink();

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink },
    });

    return { app, server: mockServer, auditSink };
  }

  function githubTransaction(overrides: {
    action: "github:pr-fetch" | "github:pr-merge";
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
        action: overrides.action,
        target: `${overrides.owner}/${overrides.repo}#${overrides.pullNumber}`,
        parameters: Object.freeze(
          overrides.action === "github:pr-merge"
            ? { mergeMethod: overrides.mergeMethod ?? "squash" }
            : {},
        ),
        createdAt: new Date(),
      },

      // G-73: a read and a merge are governed by different policies.
      policy:
        overrides.action === "github:pr-merge"
          ? {
              name: "github-pr-approval",
              version: "1.1.0",
              schemaVersion: "1.0.0",
            }
          : {
              name: "github-pr-read",
              version: "1.1.0",
              schemaVersion: "1.0.0",
            },

      signals: overrides.signals,

      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction;
  }

  const APPROVING_SIGNALS: BusinessTransaction["signals"] = {
    repositoryAuthorized: true,
    requiredReviewsCompleted: true,
    statusChecksPassed: true,
    branchProtected: true,
    riskScore: 5,
  };

  it("Scenario 1 (valid, in-scope): a fetch-only caller can fetch a PR's state", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPullRequest("acme", "widgets", {
      number: 42,
      mergeable: true,
      mergedAt: null,
      headSha: "abc123",
      baseRef: "main",
    });

    const transaction = githubTransaction({
      action: "github:pr-fetch",
      owner: "acme",
      repo: "widgets",
      pullNumber: 42,
      signals: APPROVING_SIGNALS,
    });

    const response = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${FETCH_ONLY_KEY}`)
      .send(
        await withTestApproval(transaction, undefined, {
          ...approver,
          privateKey: approverKeys.privateKey,
        }),
      );

    expect(response.status).toBe(200);
  });

  it("Scenario 2 (out-of-scope): the same fetch-only caller cannot merge a PR", async () => {
    const { app, server: mockServer, auditSink } = await buildApp();

    mockServer.setPullRequest("acme", "widgets", {
      number: 43,
      mergeable: true,
      mergedAt: null,
      headSha: "def456",
      baseRef: "main",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transaction = githubTransaction({
      action: "github:pr-merge",
      owner: "acme",
      repo: "widgets",
      pullNumber: 43,
      signals: APPROVING_SIGNALS,
    });

    const response = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${FETCH_ONLY_KEY}`)
      .send(transaction);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CAPABILITY_NOT_ALLOWED");
    // Distinct from a policy denial -- this caller was never let near
    // PolicyEngine.evaluate at all.
    expect(response.body.code).not.toBe("POLICY_DENIED");

    // The PR is untouched on GitHub's (mock) side, and no network call
    // was made at all -- not even the credential-mint exchange.
    expect(
      mockServer.getPullRequest("acme", "widgets", 43)?.mergedAt,
    ).toBeNull();
    expect(mockServer.mergeCalls).toBe(0);
    const gitHubCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith(mockServer.baseUrl),
    );
    expect(gitHubCalls).toHaveLength(0);
    fetchSpy.mockRestore();

    const denied = auditSink.events.find(
      (event) => event.type === "caller.capability_denied",
    );
    expect(denied).toMatchObject({
      type: "caller.capability_denied",
      callerId: "fca-fetch-only-caller",
      capability: "github:pr-merge",
      reason: "capability not allowed",
    });
    const serialized = JSON.stringify(auditSink.events);
    expect(serialized).not.toContain(FETCH_ONLY_KEY);
  });

  it(
    "Scenario 3 (jailbreak framing: an agent that decided to merge anyway): even a fully " +
      "policy-approving merge attempt is rejected at the scope boundary, before policy " +
      "evaluation or any GitHub call -- the boundary does not depend on the agent's own " +
      "decision-making, or on whether the request would otherwise have been approved",
    async () => {
      const { app, server: mockServer } = await buildApp();

      mockServer.setPullRequest("acme", "widgets", {
        number: 44,
        mergeable: true,
        mergedAt: null,
        headSha: "ghi789",
        baseRef: "main",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Same fetch-only caller as Scenario 2, but this time with signals
      // that would have made the merge succeed if capability scope were
      // the only thing standing in the way -- i.e. this is not "the
      // request was bad anyway," it is "the request was otherwise
      // completely valid, and the scope boundary still stopped it."
      const transaction = githubTransaction({
        action: "github:pr-merge",
        owner: "acme",
        repo: "widgets",
        pullNumber: 44,
        signals: APPROVING_SIGNALS,
      });

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${FETCH_ONLY_KEY}`)
        .send(transaction);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CAPABILITY_NOT_ALLOWED");
      expect(
        mockServer.getPullRequest("acme", "widgets", 44)?.mergedAt,
      ).toBeNull();
      expect(mockServer.mergeCalls).toBe(0);

      const gitHubCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).startsWith(mockServer.baseUrl),
      );
      expect(gitHubCalls).toHaveLength(0);
      fetchSpy.mockRestore();
    },
  );

  it("control: a caller explicitly scoped to both capabilities can merge -- proves scoping discriminates, not just blocks", async () => {
    const { app, server: mockServer } = await buildApp();

    mockServer.setPullRequest("acme", "widgets", {
      number: 45,
      mergeable: true,
      mergedAt: null,
      headSha: "jkl012",
      baseRef: "main",
    });

    const approval = await new ApprovalArtifactSigner().sign(
      {
        approverId: approver.approverId,
        keyId: approver.keyId,
        capability: "github:pr-merge",
        resourceId: "acme/widgets#45",
        scope: {
          field: "resourceId",
          comparator: "eq",
          value: "acme/widgets#45",
        },
        ttlSeconds: 900,
      },
      approverKeys.privateKey,
    );

    const transaction = githubTransaction({
      action: "github:pr-merge",
      owner: "acme",
      repo: "widgets",
      pullNumber: 45,
      signals: {
        ...APPROVING_SIGNALS,
        mergeApproved: true,
        approvalArtifact: JSON.parse(JSON.stringify(approval)),
      } as BusinessTransaction["signals"],
    });

    const response = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${UNRESTRICTED_KEY}`)
      .send(transaction);

    expect(response.status).toBe(200);
    expect(
      mockServer.getPullRequest("acme", "widgets", 45)?.mergedAt,
    ).not.toBeNull();
    expect(mockServer.mergeCalls).toBe(1);
  });
});
