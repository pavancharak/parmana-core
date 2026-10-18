import { generateKeyPairSync } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AuthorityType } from "@parmana/shared";
import { PolicyChangeCrypto } from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

//
// "Sign and submit in one step" in docs/site/guides/policy-lifecycle-and-approvals.mdx: chaining
// sign-then-submit by hand across the 120-second step-up window is
// fragile in practice -- shell-quoting mangles the JSON body, a human
// relay between the two steps burns the window, a stale credential
// produces a confusing STEP_UP_AUTHORIZATION_INVALID. This tutorial
// exercises the real fix directly: local-review-action.ts (sign +
// submit, one process) and refresh-approved-policy-content.ts
// (propose + sign + submit, one process), the exact scripts used to
// approve all 14 real production policies the night of 2026-09-16 --
// see docs/CLAIMS.md §2.26. Same server-bootstrap pattern Tutorial
// 103 already established, reused here rather than reinvented.
//
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");
const { hashApiKey } =
  await import("../../../packages/api/src/auth/hashApiKey.js");
const { StaticKeyAuthenticator } =
  await import("../../../packages/api/src/auth/StaticKeyAuthenticator.js");
const { PolicyChangeStepUpVerifier } =
  await import("../../../packages/api/src/auth/PolicyChangeStepUpVerifier.js");
const { PolicyChangeApprovalService } =
  await import("../../../packages/api/src/governance/PolicyChangeApprovalService.js");
const { main: localReviewAction } =
  await import("../../../scripts/local-review-action.js");
const { main: refreshApprovedPolicyContent } =
  await import("../../../scripts/refresh-approved-policy-content.js");

const MAKER_KEY = "tutorial-117-maker-raw-key";
const CHECKER_KEY = "tutorial-117-checker-raw-key";

const checkerStepUpKeyPair = generateKeyPairSync("ed25519");
const checkerPrivateKeyPem = checkerStepUpKeyPair.privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString();

function policyBody(policyId: string, description: string) {
  return {
    policyId,
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    description,
    // Governance refuses a policy that approves without a signed human
    // approval, so the fixture's one approve rule requires one.
    approvalSignals: { humanApproved: { resourceId: "target" } },
    rules: [
      {
        id: "approve-with-approval",
        condition: { fact: "humanApproved", operator: "is_true" },
        outcome: { action: "approve", reason: "tutorial fixture" },
      },
    ],
  };
}

// Two scratch directories: one for FilePolicyRepository behind the
// running server (what PolicyChangeApprovalService.approve() actually
// writes to), one that refresh-approved-policy-content.ts reads FROM
// via PARMANA_POLICY_DIR -- distinct on purpose, so "propose whatever
// is currently on disk" and "what got approved" stay visibly separate
// steps, not the same object reused.
const serverPolicyDir = mkdtempSync(
  path.join(tmpdir(), "parmana-tutorial-117-server-policies-"),
);
const sourcePolicyDir = mkdtempSync(
  path.join(tmpdir(), "parmana-tutorial-117-source-policies-"),
);
const tempKeyDir = mkdtempSync(
  path.join(tmpdir(), "parmana-tutorial-117-keys-"),
);
const checkerPrivateKeyPath = path.join(
  tempKeyDir,
  "checker.step-up.private.pem",
);
writeFileSync(checkerPrivateKeyPath, checkerPrivateKeyPem, "utf8");

const REFRESH_POLICY_NAME = "tutorial-117-refreshed-policy";
mkdirSync(path.join(sourcePolicyDir, REFRESH_POLICY_NAME, "1.0.0"), {
  recursive: true,
});
writeFileSync(
  path.join(sourcePolicyDir, REFRESH_POLICY_NAME, "1.0.0", "policy.json"),
  JSON.stringify(
    policyBody(
      REFRESH_POLICY_NAME,
      "Proposed straight from disk by refresh-approved-policy-content.ts.",
    ),
    null,
    2,
  ),
  "utf8",
);

const policyChangeApprovalRecordRepository =
  new MemoryPolicyChangeApprovalRecordRepository();
const policyChangeApprovalService = new PolicyChangeApprovalService({
  policyRepository: new FilePolicyRepository(serverPolicyDir),
  policyChangeCrypto: new PolicyChangeCrypto(),
  policyChangeApprovalRecordRepository,
});

const authenticator = new StaticKeyAuthenticator([
  {
    callerId: "maker",
    keyHash: hashApiKey(MAKER_KEY),
    credentialHolderType: AuthorityType.USER,
  },
  {
    callerId: "checker",
    keyHash: hashApiKey(CHECKER_KEY),
    credentialHolderType: AuthorityType.USER,
    stepUpPublicKey: checkerStepUpKeyPair.publicKey
      .export({ format: "pem", type: "spki" })
      .toString(),
  },
]);

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem);
const app = createApp(application, {
  callerAuth: { authenticator, auditSink: { record: async () => {} } },
  stepUpVerifier: new PolicyChangeStepUpVerifier({
    nonceStore: new MemoryNonceStore(),
  }),
  policyChangeApprovalService,
});

const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

console.log();
console.log("==================================================");
console.log("Tutorial 117 - Maker-Checker One-Shot Scripts");
console.log("==================================================");
console.log();

const originalLog = console.log;
const originalError = console.error;

function captureOutput(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  console.log = (...args) => lines.push(args.join(" "));
  console.error = (...args) => lines.push(args.join(" "));
  return fn()
    .catch(() => {})
    .then(() => {
      console.log = originalLog;
      console.error = originalError;
      return lines.join("\n");
    });
}

try {
  const POLICY_NAME = "tutorial-117-governed-policy";

  console.log(
    "Scenario 1: propose the ordinary way, then sign+submit in ONE process (local-review-action.ts)",
  );
  console.log("--------------------------------------------------");
  const proposeResponse = await fetch(
    `${baseUrl}/policies/${POLICY_NAME}/1.0.0/pending-changes`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MAKER_KEY}`,
      },
      body: JSON.stringify({
        proposedContent: policyBody(
          POLICY_NAME,
          "Proposed normally; approved via local-review-action.ts.",
        ),
        reason: "tutorial proposal",
      }),
    },
  );
  const proposeBody = await proposeResponse.json();
  const pendingPolicyChangeId = proposeBody.pendingPolicyChangeId as string;
  console.log(
    `Proposed : status ${proposeResponse.status}, id ${pendingPolicyChangeId}`,
  );

  process.env.REVIEWER_KEY = CHECKER_KEY;
  const scenario1Output = await captureOutput(() =>
    localReviewAction([
      "--pending-policy-change-id",
      pendingPolicyChangeId,
      "--action",
      "approve",
      "--private-key-file",
      checkerPrivateKeyPath,
      "--key-id",
      "tutorial-117-checker-step-up-key",
      "--api-base",
      baseUrl,
    ]),
  );
  const scenario1Approved = scenario1Output.includes('"status":"APPROVED"');
  console.log(
    `local-review-action.ts result : HTTP status line + body captured`,
  );
  console.log(`  Resolved to APPROVED : ${scenario1Approved}`);
  console.log();

  console.log(
    "Scenario 2: propose AND sign+submit in ONE process, straight from disk (refresh-approved-policy-content.ts)",
  );
  console.log("--------------------------------------------------");
  process.env.PROPOSER_KEY = MAKER_KEY;
  process.env.PARMANA_POLICY_DIR = sourcePolicyDir;
  const scenario2Output = await captureOutput(() =>
    refreshApprovedPolicyContent([
      "--policy-name",
      REFRESH_POLICY_NAME,
      "--policy-version",
      "1.0.0",
      "--private-key-file",
      checkerPrivateKeyPath,
      "--key-id",
      "tutorial-117-checker-step-up-key",
      "--api-base",
      baseUrl,
    ]),
  );
  const scenario2Approved = scenario2Output.includes('"status":"APPROVED"');
  console.log(
    `refresh-approved-policy-content.ts result : HTTP status line + body captured`,
  );
  console.log(`  Resolved to APPROVED : ${scenario2Approved}`);
  console.log();

  const writtenPolicy1 = JSON.parse(
    readFileSync(
      path.join(serverPolicyDir, POLICY_NAME, "1.0.0", "policy.json"),
      "utf8",
    ),
  );
  const writtenPolicy2 = JSON.parse(
    readFileSync(
      path.join(serverPolicyDir, REFRESH_POLICY_NAME, "1.0.0", "policy.json"),
      "utf8",
    ),
  );
  const record1 = await policyChangeApprovalRecordRepository.findMostRecentFor(
    POLICY_NAME,
    "1.0.0",
  );
  const record2 = await policyChangeApprovalRecordRepository.findMostRecentFor(
    REFRESH_POLICY_NAME,
    "1.0.0",
  );

  console.log("Scenario 3: verify both landed identically to the manual flow");
  console.log("--------------------------------------------------");
  console.log(
    `Live policy.json written (scenario 1) : policyId=${writtenPolicy1.policyId}`,
  );
  console.log(
    `Live policy.json written (scenario 2) : policyId=${writtenPolicy2.policyId}`,
  );
  console.log(
    `Signed approval records persisted : approvedBy=${record1?.approvedBy}/${record2?.approvedBy}, both signed=${record1?.signature !== undefined && record2?.signature !== undefined}`,
  );
  console.log();

  const allPassed =
    proposeResponse.status === 201 &&
    scenario1Approved &&
    scenario2Approved &&
    writtenPolicy1.policyId === POLICY_NAME &&
    writtenPolicy2.policyId === REFRESH_POLICY_NAME &&
    record1?.approvedBy === "checker" &&
    record2?.approvedBy === "checker" &&
    record1?.signature !== undefined &&
    record2?.signature !== undefined;

  if (allPassed) {
    console.log(
      "✓ Both one-shot scripts produce the exact same durable effects (written policy.json, signed approval record) as the manual sign-then-curl flow -- with no 120-second relay through a human in between.",
    );
  } else {
    console.log(
      "✗ Expected both scripts to resolve their pending change to APPROVED with a written file and a signed record.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log(
    "Next: Tutorial 118 - The HubSpot State Check Signs With the Configured Key",
  );
} finally {
  console.log = originalLog;
  console.error = originalError;
  await new Promise((resolve) => server.close(resolve));
  rmSync(serverPolicyDir, { recursive: true, force: true });
  rmSync(sourcePolicyDir, { recursive: true, force: true });
  rmSync(tempKeyDir, { recursive: true, force: true });
  delete process.env.REVIEWER_KEY;
  delete process.env.PROPOSER_KEY;
  delete process.env.PARMANA_POLICY_DIR;
}
