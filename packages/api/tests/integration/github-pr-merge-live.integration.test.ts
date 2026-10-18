import { generateKeyPairSync, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ExecutionRejectedError,
  HttpTransport,
  InternalServerError,
  ParmanaClient,
} from "@parmana/sdk";
import type { BusinessTransaction } from "@parmana/sdk";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

import {
  resolveGitHubLiveGate,
  resolveGitHubTestRepositoryGate,
} from "../helpers/github-live-availability.js";

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

const gitHubLiveConfigured = resolveGitHubLiveGate("GitHub Live Integration");

const testRepository = gitHubLiveConfigured
  ? resolveGitHubTestRepositoryGate("GitHub Live Reachability")
  : undefined;

/**
 * The first network call this codebase ever makes to a real GitHub
 * endpoint (api.github.com), gated exactly like
 * hubspot-live.integration.test.ts gates on ALLOW_LIVE_HUBSPOT — see
 * resolveGitHubLiveGate's comment and packages/api/README.md.
 *
 * Deliberately no mutating (merge) case, unlike hubspot-live's own
 * "deal update (mutating)" block. HubSpot's mutating case is safe
 * because a deal's amount is a numeric field: nudge it, verify, revert
 * to the original value, and the deal is exactly as found. A GitHub PR
 * merge has no equivalent: merging closes the PR and adds a merge
 * commit to the base branch's history; there is no general, safe "revert
 * a merge" operation this suite could automate without either being
 * fictional (force-pushing a branch ref does not undo a merge commit
 * already on the base branch, and risks destroying unrelated commits if
 * the ref moved) or requiring its own separate merge (a revert commit
 * via a revert PR), which reintroduces the same "how do we undo *that*"
 * problem one level down. Proving the real merge path end to end is left
 * to a deliberate, manual live run against a disposable test PR the
 * operator has already decided is fine to leave merged -- not something
 * this suite performs unattended.
 *
 * What this suite does prove, live, unattended, and non-destructively:
 *
 *   1. The full ephemeral-credential mint -> connector dispatch chain
 *      reaches GitHub's real API (either the access_tokens exchange or
 *      the merge endpoint itself responds, depending on which layer the
 *      configured test credentials are valid for) -- driven through the
 *      real, installable @parmana/sdk package, over a real listening
 *      HTTP server, mirroring hubspot-live.integration.test.ts's own
 *      rationale for doing so instead of driving the in-process Express
 *      app object directly.
 *   2. Policy denial still makes zero real GitHub calls when a real
 *      GitHub connector (not a mock) is wired in -- the same
 *      "policy-denial-makes-zero-calls" proof as the hermetic suite,
 *      reinforced here against the production connector.
 *
 * Prerequisite: `npm run build` in typescript/ must have already
 * produced dist/ -- already true in CI and after any local `npm run
 * build` at the repo root.
 */
describe.skipIf(!gitHubLiveConfigured)(
  "GitHub live (through the real @parmana/sdk package)",
  () => {
    const originalGitHubBaseUrl = process.env.GITHUB_BASE_URL;

    let server: Server;
    let client: ParmanaClient;

    beforeAll(async () => {
      // No bridge needed: createGitHubCredentialProvider.ts's NODE_ENV=test
      // branch reads TEST_GITHUB_APP_ID/TEST_GITHUB_INSTALLATION_ID/
      // TEST_GITHUB_APP_PRIVATE_KEY directly -- the same names documented
      // in .env.example -- so the real test credentials already sitting in
      // the environment are picked up with no test-side mutation, and
      // never appear in a variable, log, or assertion below.

      // No GITHUB_BASE_URL override: GitHubConnector falls back to its own
      // default, GitHub's real base URL (https://api.github.com).
      delete process.env.GITHUB_BASE_URL;

      const executionSystem = await createExecutionSystem();
      const application = createApplication(executionSystem);
      const app = createApp(application, { callerAuth: "disabled" });

      server = await new Promise<Server>((resolve) => {
        const httpServer = app.listen(0, "127.0.0.1", () =>
          resolve(httpServer),
        );
      });

      const address = server.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${address.port}`;

      client = new ParmanaClient({
        endpoint,
        transport: new HttpTransport({ endpoint }),
      });
    });

    afterAll(async () => {
      if (originalGitHubBaseUrl === undefined) {
        delete process.env.GITHUB_BASE_URL;
      } else {
        process.env.GITHUB_BASE_URL = originalGitHubBaseUrl;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    interface ObservedCall {
      method: string;
      url: string;
      status: number;
    }

    let realFetch: typeof fetch;
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let observed: ObservedCall[] = [];

    beforeAll(() => {
      realFetch = globalThis.fetch.bind(globalThis);
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
          const response = await realFetch(input, init);
          observed.push({
            method: init?.method ?? "GET",
            url: String(input),
            status: response.status,
          });
          return response;
        });
    });

    afterAll(() => {
      fetchSpy.mockRestore();
    });

    afterEach(() => {
      observed = [];
    });

    function liveTransaction(overrides: {
      owner: string;
      repo: string;
      pullNumber: number;
      mergeMethod?: string;
      signals: BusinessTransaction["signals"];
    }): BusinessTransaction {
      const businessTransactionId = randomUUID();
      const authorityId = randomUUID();
      const authorizationId = randomUUID();
      const intentId = randomUUID();
      const now = new Date();

      return {
        businessTransactionId,

        metadata: {
          businessTransactionId,
          correlationId: randomUUID(),
          sourceSystem: "github-live-integration-test",
          submittedBy: "github-live-integration-test",
          submittedAt: now,
        },

        authority: {
          authorityId,
          authorityType: "USER",
          principalId: "github-live-integration-test",
          displayName: "GitHub Live Integration Test",
          issuedAt: now,
        },

        authorization: {
          authorizationId,
          authorityId,
          purpose: "GitHub live integration test",
          issuedAt: now,
        },

        intent: {
          intentId,
          authorizationId,
          action: "github:pr-merge",
          target: `${overrides.owner}/${overrides.repo}#${overrides.pullNumber}`,
          parameters: {
            mergeMethod: overrides.mergeMethod ?? "squash",
          },
          createdAt: now,
        },

        policy: {
          name: "github-pr-approval",
          version: "1.1.0",
          schemaVersion: "1.0.0",
        },

        signals: overrides.signals,

        status: "RECEIVED",
        createdAt: now,
      };
    }

    async function approvedSignals(
      pullRequest: string,
    ): Promise<BusinessTransaction["signals"]> {
      const approval = await new ApprovalArtifactSigner().sign(
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

      return {
        mergeApproved: true,
        repositoryAuthorized: true,
        requiredReviewsCompleted: true,
        statusChecksPassed: true,
        branchProtected: true,
        riskScore: 5,
        approvalArtifact: JSON.parse(JSON.stringify(approval)),
      } as BusinessTransaction["signals"];
    }

    // Fixed, deliberately non-existent pull request number: real enough to
    // be well-formed, but guaranteed never to exist against any repository,
    // so this test can never merge or otherwise mutate real data no matter
    // which repository the configured installation can see.
    const NON_EXISTENT_PULL_NUMBER = 999_999_999;

    describe.skipIf(testRepository === undefined)(
      "GitHub live reachability",
      () => {
        const [owner, repo] = (testRepository ?? "/").split("/");

        it("drives github:pr-merge through a real POST /execute (via the SDK) to the live GitHub API", async () => {
          const transaction = liveTransaction({
            owner: owner as string,
            repo: repo as string,
            pullNumber: NON_EXISTENT_PULL_NUMBER,
            signals: await approvedSignals(
              `${owner}/${repo}#${NON_EXISTENT_PULL_NUMBER}`,
            ),
          });

          let caught: unknown;
          try {
            await client.execute(transaction);
          } catch (error) {
            caught = error;
          }

          // The connector's real error detail is swallowed by the generic
          // error handler (mirrors hubspot-live.integration.test.ts's own
          // documented behavior) -- this only proves the full chain ran and
          // reached the connector's (or the credential provider's) failure
          // path, thrown as the SDK's typed InternalServerError.
          expect(caught).toBeInstanceOf(InternalServerError);
          expect((caught as InternalServerError).message).toBe(
            "Internal Server Error",
          );

          // The independent, out-of-band proof that this specific failure
          // came from a genuine GitHub HTTP response, not a network failure
          // or a bug that never left this process: at least one real call
          // landed on api.github.com (either the access_tokens exchange or
          // the merge endpoint, depending on which layer the configured
          // test credentials are valid for), and a real client-error status
          // came back.
          const gitHubCalls = observed.filter(
            (entry) => new URL(entry.url).host === "api.github.com",
          );
          expect(gitHubCalls.length).toBeGreaterThanOrEqual(1);
          expect(gitHubCalls.every((entry) => entry.status >= 400)).toBe(true);
        }, 30_000);
      },
    );

    it("denies a policy-failing merge through POST /execute (via the SDK) before any GitHub call", async () => {
      const transaction = liveTransaction({
        owner: "acme",
        repo: "widgets",
        pullNumber: NON_EXISTENT_PULL_NUMBER,
        signals: {
          repositoryAuthorized: true,
          requiredReviewsCompleted: true,
          statusChecksPassed: false,
          branchProtected: true,
          riskScore: 5,
        },
      });

      let caught: unknown;
      try {
        await client.execute(transaction);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ExecutionRejectedError);

      // Policy rejection happens in ExecutionGate.enforce, before
      // ExecutionComponent ever dispatches to the connector or resolves a
      // credential -- zero real GitHub calls for the denial itself, not
      // even the access_tokens exchange.
      const gitHubCalls = observed.filter(
        (entry) => new URL(entry.url).host === "api.github.com",
      );
      expect(gitHubCalls).toHaveLength(0);
    }, 30_000);
  },
);
