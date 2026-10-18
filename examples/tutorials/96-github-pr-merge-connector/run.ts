import crypto from "node:crypto";

import {
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { BusinessTransaction } from "@parmana/shared";
import { MockGitHubServer } from "@parmana/connector-github";

//
// The GitHub sibling of Tutorial 69: approve + execute a real PR merge
// through the same production composition (createExecutionSystem +
// createApplication), pointed at a hermetic MockGitHubServer via the
// GITHUB_BASE_URL test seam instead of GitHub's live API.
//
// github-pr-approval 1.1.0 (G-73) authorizes a merge only with a signed
// approval from a trusted person for that exact pull request. The
// review, check, branch and risk signals come from the caller, so they
// can refuse a merge but never authorize one. Step 1 shows an agent that
// declares every one of them true, with no approval: refused. Step 2
// shows the same merge with a signed approval: merged.
//
process.env.NODE_ENV = "test";
// Test-only: this example runs with no maker-checker records for its policy.
process.env.PARMANA_ALLOW_UNGOVERNED_POLICY = "true";

const INSTALLATION_TOKEN = "test-mock-installation-token-a1b2c3d4e5f6";

const mockServer = new MockGitHubServer({
  installationToken: INSTALLATION_TOKEN,
});
await mockServer.listen();

process.env.GITHUB_BASE_URL = mockServer.baseUrl;
// Unlike HubSpot's single static token, GitHub's credential is ephemeral:
// every resolve() signs a JWT and exchanges it for a short-lived
// installation token. With TEST_GITHUB_APP_ID/TEST_GITHUB_INSTALLATION_ID/
// TEST_GITHUB_APP_PRIVATE_KEY left unset (the default), NODE_ENV=test
// alone makes createGitHubCredentialProvider.ts generate a fresh,
// never-real RSA keypair and harmless placeholder ids -- MockGitHubServer
// never verifies the JWT's signature, so no further env overrides are
// needed here the way Tutorial 69 needs for HubSpot's empty-string gotcha.

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");

function prMergeTransaction(overrides: {
  owner: string;
  repo: string;
  pullNumber: number;
  mergeMethod?: string;
  signals: Record<string, unknown>;
}): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-96",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-96",
      displayName: "Tutorial 96",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Tutorial",
      authorizedAt: now,
    },
    intent: {
      intentId,
      authorizationId,
      action: "github:pr-merge",
      target: `${overrides.owner}/${overrides.repo}#${overrides.pullNumber}`,
      parameters: Object.freeze({
        mergeMethod: overrides.mergeMethod ?? "squash",
      }),
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
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 96 - GitHub PR Merge Connector");
console.log("==================================================");
console.log();

try {
  mockServer.setPullRequest("acme", "widgets", {
    number: 42,
    mergeable: true,
    mergedAt: null,
    headSha: "abc123",
    baseRef: "main",
  });

  // The reviewer's key pair, made here. Only the public half is trusted.
  // In production the reviewer runs scripts/generate-approver-key.ts on
  // their own machine and the operator lists the public key in
  // TRUSTED_APPROVAL_ISSUERS (createApprovalIssuerRegistry.ts).
  const reviewer = crypto.generateKeyPairSync("ed25519");
  const REVIEWER = {
    approverId: "reviewer-asha",
    keyId: "reviewer-asha-key-1",
  };

  const approvalVerifier = new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: new StaticApprovalIssuerRegistry([
      { ...REVIEWER, publicKey: reviewer.publicKey, revoked: false },
    ]),
    nonceStore: new MemoryNonceStore(),
  });

  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem, approvalVerifier);

  const callerDeclaredFacts = {
    repositoryAuthorized: true,
    requiredReviewsCompleted: true,
    statusChecksPassed: true,
    branchProtected: true,
    riskScore: 5,
  };

  //
  // Step 1: the agent declares every fact true and mergeApproved true,
  // with no approval attached.
  //
  console.log("Step 1: every caller declared fact true, no approval");
  console.log("--------------------------------------------------");

  try {
    await application.execute(
      prMergeTransaction({
        owner: "acme",
        repo: "widgets",
        pullNumber: 42,
        signals: { ...callerDeclaredFacts, mergeApproved: true },
      }),
    );
    console.log("✗ Expected a refusal.");
  } catch (error) {
    console.log(
      `Refused : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.log(`Merge calls : ${mockServer.mergeCalls}`);
  console.log();

  //
  // Step 2: the reviewer signs an approval for acme/widgets#42, and the
  // agent sends a new request with it.
  //
  const approval = await new ApprovalArtifactSigner().sign(
    {
      ...REVIEWER,
      capability: "github:pr-merge",
      resourceId: "acme/widgets#42",
      scope: {
        field: "resourceId",
        comparator: "eq",
        value: "acme/widgets#42",
      },
      ttlSeconds: 900,
    },
    reviewer.privateKey,
  );

  const trustRecord = await application.execute(
    prMergeTransaction({
      owner: "acme",
      repo: "widgets",
      pullNumber: 42,
      signals: {
        ...callerDeclaredFacts,
        mergeApproved: true,
        approvalArtifact: JSON.parse(JSON.stringify(approval)),
      },
    }),
  );
  const decision = trustRecord.executions.at(-1)?.decision;

  console.log("Step 2: the same merge with a signed approval");
  console.log("--------------------------------------------------");
  console.log(`Outcome : ${decision?.outcome}`);
  console.log(`Reason  : ${decision?.reason}`);
  console.log();

  // The strongest proof this went through the real connector end to
  // end: the PR actually merged on the (mock) GitHub server.
  const pr = mockServer.getPullRequest("acme", "widgets", 42);

  console.log("GitHub Mock Server State");
  console.log("--------------------------------------------------");
  console.log(`PR #42 mergedAt : ${pr?.mergedAt}`);
  console.log(`Merge calls     : ${mockServer.mergeCalls}`);
  console.log();

  if (
    decision?.outcome === "APPROVED" &&
    pr?.mergedAt !== null &&
    mockServer.mergeCalls === 1
  ) {
    console.log(
      "✓ Refused without an approval; merged once with a signed approval.",
    );
  } else {
    console.log("✗ Expected one refusal, then one approved merge.");
    process.exitCode = 1;
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 97 - Execution Chain Integrity");
} finally {
  await mockServer.close();
}
