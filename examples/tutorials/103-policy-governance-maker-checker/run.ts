import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AuthorityType,
  type PolicyChangeStepUpAuthorization,
} from "@parmana/shared";
import {
  PolicyChangeStepUpAuthorizationSigner,
  PolicyChangeCrypto,
} from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

//
// docs/CLAIMS.md 2.26: policy content changes go through a human-only,
// maker-checker approval flow before taking effect. Four endpoints
// (packages/api/src/routes/pending-policy-changes.ts): propose, list,
// approve, reject. Every one calls requireHumanCaller() first. Approve/
// reject additionally require the checker to be a DIFFERENT caller than
// the maker (SameActorCannotApproveOwnChangeError), and a step-up
// authorization envelope signed by the checker's own key, on top of
// their bearer token. PolicyChangeApprovalService signs and durably
// persists the approval record BEFORE writing the live policy.json file.
// Mirrors packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts.
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

const MAKER_KEY = "tutorial-103-maker-raw-key";
const CHECKER_KEY = "tutorial-103-checker-raw-key";
const SERVICE_KEY = "tutorial-103-service-raw-key";

const checkerStepUpKeyPair = generateKeyPairSync("ed25519");
const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();

function signStepUp(
  pendingPolicyChangeId: string,
  action: "approve" | "reject",
  privateKey: KeyObject = checkerStepUpKeyPair.privateKey,
): Promise<PolicyChangeStepUpAuthorization> {
  return stepUpSigner.sign(
    { pendingPolicyChangeId, action },
    privateKey,
    "tutorial-103-checker-step-up-key",
    120,
  );
}

function policyBody(policyId: string) {
  return {
    policyId,
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
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

// A scratch policies/ directory, never the real repo-root policies/ tree
// -- this tutorial writes an approved policy.json file for real, and
// must not litter the real tree with a fake tutorial policy.
const scratchPolicyDir = mkdtempSync(
  path.join(tmpdir(), "parmana-tutorial-103-policies-"),
);

const policyChangeApprovalRecordRepository =
  new MemoryPolicyChangeApprovalRecordRepository();
const policyChangeApprovalService = new PolicyChangeApprovalService({
  policyRepository: new FilePolicyRepository(scratchPolicyDir),
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
  {
    callerId: "service-caller",
    keyHash: hashApiKey(SERVICE_KEY),
    credentialHolderType: AuthorityType.SERVICE,
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
console.log("Tutorial 103 - Policy Governance (Maker-Checker)");
console.log("==================================================");
console.log();

try {
  const POLICY_NAME = "tutorial-103-governed-policy";

  console.log("Scenario 1: A human caller proposes a policy change");
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
        proposedContent: policyBody(POLICY_NAME),
        reason: "tutorial proposal",
      }),
    },
  );
  const proposeBody = await proposeResponse.json();
  const pendingPolicyChangeId = proposeBody.pendingPolicyChangeId as string;
  console.log(`Status : ${proposeResponse.status}`);
  console.log(`Pending change id : ${pendingPolicyChangeId}`);
  console.log();

  console.log(
    "Scenario 2: A SERVICE-credentialed caller cannot propose at all",
  );
  console.log("--------------------------------------------------");
  const serviceProposeResponse = await fetch(
    `${baseUrl}/policies/${POLICY_NAME}-service-attempt/1.0.0/pending-changes`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        proposedContent: policyBody(`${POLICY_NAME}-service-attempt`),
        reason: "should be denied",
      }),
    },
  );
  const serviceProposeBody = await serviceProposeResponse.json();
  console.log(
    `Status : ${serviceProposeResponse.status}, code: ${serviceProposeBody.code}`,
  );
  console.log();

  console.log(
    "Scenario 3: The maker cannot approve its own proposal (maker != checker)",
  );
  console.log("--------------------------------------------------");
  const selfApproveResponse = await fetch(
    `${baseUrl}/policies/pending-changes/${pendingPolicyChangeId}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MAKER_KEY}`,
      },
      body: JSON.stringify({}),
    },
  );
  const selfApproveBody = await selfApproveResponse.json();
  console.log(
    `Status : ${selfApproveResponse.status}, code: ${selfApproveBody.code}`,
  );
  console.log();

  console.log(
    "Scenario 4: A distinct checker, but with NO step-up envelope, is still denied",
  );
  console.log("--------------------------------------------------");
  const noStepUpResponse = await fetch(
    `${baseUrl}/policies/pending-changes/${pendingPolicyChangeId}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHECKER_KEY}`,
      },
      body: JSON.stringify({}),
    },
  );
  const noStepUpBody = await noStepUpResponse.json();
  console.log(
    `Status : ${noStepUpResponse.status}, code: ${noStepUpBody.code}`,
  );
  console.log();

  console.log(
    "Scenario 5: A distinct checker WITH a valid step-up envelope approves -- file written, signed record persisted",
  );
  console.log("--------------------------------------------------");
  const stepUpAuthorization = await signStepUp(
    pendingPolicyChangeId,
    "approve",
  );
  const approveResponse = await fetch(
    `${baseUrl}/policies/pending-changes/${pendingPolicyChangeId}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHECKER_KEY}`,
      },
      body: JSON.stringify({ stepUpAuthorization }),
    },
  );
  const approveBody = await approveResponse.json();
  console.log(`Status : ${approveResponse.status}`);
  console.log(
    `Resolved status : ${approveBody.status}, resolvedBy: ${approveBody.resolvedBy}`,
  );

  const writtenPolicy = JSON.parse(
    readFileSync(
      path.join(scratchPolicyDir, POLICY_NAME, "1.0.0", "policy.json"),
      "utf8",
    ),
  );
  const records = await policyChangeApprovalRecordRepository.findMostRecentFor(
    POLICY_NAME,
    "1.0.0",
  );
  console.log(`Live policy.json written : policyId=${writtenPolicy.policyId}`);
  console.log(
    `Signed approval record persisted : approvedBy=${records?.approvedBy}, hasSignature=${records?.signature !== undefined}`,
  );
  console.log();

  const allPassed =
    proposeResponse.status === 201 &&
    serviceProposeResponse.status === 403 &&
    serviceProposeBody.code === "NON_HUMAN_CALLER_DENIED" &&
    selfApproveResponse.status === 403 &&
    selfApproveBody.code === "SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE" &&
    noStepUpResponse.status === 403 &&
    noStepUpBody.code === "STEP_UP_AUTHORIZATION_INVALID" &&
    approveResponse.status === 200 &&
    approveBody.status === "APPROVED" &&
    approveBody.resolvedBy === "checker" &&
    writtenPolicy.policyId === POLICY_NAME &&
    records?.approvedBy === "checker" &&
    records?.signature !== undefined;

  if (allPassed) {
    console.log(
      "✓ Human-only, maker != checker, and step-up authorization are all enforced independently; the live policy file and a signed approval record both exist only after every layer passes.",
    );
  } else {
    console.log(
      "✗ Expected every governance layer above to behave exactly as documented.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 104 - Policy Governance Execution Verification");
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(scratchPolicyDir, { recursive: true, force: true });
}
