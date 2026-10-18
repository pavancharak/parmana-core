// Offline check for the self hosted deployment (G-60).
//
// Runs inside the same Docker network as the API, a network created with
// `internal: true`, so no container in it has a route to the internet
// (docker-compose.offline-check.yml). This container holds the check's own
// API keys and the two PUBLIC signing keys, never a signing private key.
//
// It proves, in order:
//   1. the network really has no internet route;
//   2. the API reports READY;
//   3. policy governance works: one verified human proposes the shipped
//      customer-refund policy, the same human is refused as approver, and
//      a different human approves it with a signed step-up authorization;
//      the same two humans then add a trusted refund manager key through
//      maker checker;
//   4. a refund with the manager's signed approval is executed (200) and
//      reaches the downstream system, which verifies the gateway's
//      signature itself;
//   5. a refund the policy's rules refuse is rejected (403 POLICY_DENIED,
//      for the policy's own reason) and never reaches the downstream system;
//   6. the Trust Record for the authorized refund verifies with only the
//      public keys, and a copy with one changed field does not.
//
// The Trust Record is saved to /out/trust-record.json, with the public keys
// next to it, so it can be checked again later with
// scripts/verify-trust-record.ts.

import { createPrivateKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import {
  ApprovalArtifactSigner,
  PolicyChangeStepUpAuthorizationSigner,
  verifyExecutionTrustRecordOffline,
} from "@parmana/crypto";

const apiUrl = process.env.PARMANA_API_URL ?? "http://api:3000";
const standInUrl =
  process.env.STAND_IN_URL ?? "https://paytm-agent-stand-in:4399";

const identities = JSON.parse(readFileSync("/identities/secrets.json", "utf8"));
const { operator, proposer, approver } = identities;

const policyName = "customer-refund";
// 1.2.0: every refund needs a manager's signed approval (G-75), and no
// agent action runs without a signed human approval (G-80). The image
// trusts no approver, so this check adds one through maker checker, the
// same way an operator would, with a key made here in this throwaway
// network. 1.1.0 no longer loads.
const policyVersion = "1.2.0";

// The refund manager this check adds and signs approvals as.
const manager = {
  approverId: "offline-check-manager",
  keyId: "offline-check-manager-key-1",
  keys: generateKeyPairSync("ed25519"),
};
const policyContent = JSON.parse(
  readFileSync(
    `/app/policies/${policyName}/${policyVersion}/policy.json`,
    "utf8",
  ),
);

const publicKeys = {
  default: readFileSync("/public-keys/default.public.pem", "utf8"),
  gateway: readFileSync("/public-keys/gateway.public.pem", "utf8"),
};

const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed });
  console.log(
    `${passed ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`,
  );
}

async function call(method, path, key, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const describe = (response) =>
  `HTTP ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`;

async function noInternetRoute() {
  for (const url of ["https://1.1.1.1", "https://registry.npmjs.org"]) {
    try {
      // Either the request fails (expected) or five seconds pass with no
      // answer, which also means no usable route.
      const outcome = await Promise.race([
        fetch(url).then(() => "reached"),
        sleep(5000).then(() => "timed out"),
      ]);
      if (outcome === "timed out") continue;
      return `reached ${url}`;
    } catch {
      // expected: no route
    }
  }
  return undefined;
}

async function waitForReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const { body } = await call("GET", "/ready");
      if (body.status === "READY") return body;
    } catch {
      // not up yet
    }
    await sleep(2000);
  }
  return undefined;
}

async function refund({ amount, managerApproved }) {
  const businessTransactionId = randomUUID();
  const authorityId = randomUUID();
  const authorizationId = randomUUID();
  const orderId = `offline-order-${businessTransactionId.slice(0, 8)}`;
  const now = new Date().toISOString();

  // The manager signs an approval for this order, up to this amount.
  const approvalArtifact = managerApproved
    ? JSON.parse(
        JSON.stringify(
          await new ApprovalArtifactSigner().sign(
            {
              approverId: manager.approverId,
              keyId: manager.keyId,
              capability: "paytm:refund",
              resourceId: orderId,
              scope: { field: "value", comparator: "lte", value: amount },
              ttlSeconds: 900,
            },
            manager.keys.privateKey,
          ),
        ),
      )
    : undefined;

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: randomUUID(),
      createdBy: "offline-check",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "USER",
      // A key may only act for its own caller ID unless it lists other
      // principals (packages/api/src/auth/isPrincipalAllowed.ts).
      principalId: operator.callerId,
      displayName: "Offline check operator",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Offline check of the self hosted deployment",
      authorizedAt: now,
    },
    intent: {
      intentId: randomUUID(),
      authorizationId,
      action: "paytm:refund",
      target: `paytm://orders/${orderId}`,
      parameters: { orderId, transactionId: `txn-${orderId}`, amount },
      createdAt: now,
    },
    policy: {
      name: policyName,
      version: policyVersion,
      schemaVersion: "1.0.0",
    },
    signals: {
      refundEligible: true,
      managerApproved,
      fraudCheckPassed: true,
      refundAmount: amount,
      ...(approvalArtifact !== undefined ? { approvalArtifact } : {}),
    },
    decision: { outcome: "APPROVED" },
    status: "APPROVED",
    createdAt: now,
  };
}

async function acceptedByStandIn() {
  const response = await fetch(`${standInUrl}/calls`);
  return (await response.json()).accepted;
}

// 1 and 2
const reached = await noInternetRoute();
check("no internet route from this network", reached === undefined, reached);

const ready = await waitForReady();
check(
  "API reports READY",
  ready !== undefined,
  ready ? JSON.stringify(ready) : "timed out",
);

// 3. Policy governance: propose, refuse self approval, approve.
const proposed = await call(
  "POST",
  `/policies/${policyName}/${policyVersion}/pending-changes`,
  proposer.key,
  {
    proposedContent: policyContent,
    reason: "Offline check: adopt the shipped customer-refund policy.",
  },
);
check(
  "policy change proposed by a verified human",
  proposed.status === 201,
  describe(proposed),
);

const pendingId = proposed.body?.pendingPolicyChangeId;
const signer = new PolicyChangeStepUpAuthorizationSigner();

const stepUpFor = async (id) =>
  signer.sign(
    { pendingPolicyChangeId: id, action: "approve" },
    createPrivateKey(approver.stepUpPrivateKeyPem),
    "offline-check-approver",
    120,
  );

const selfApproval = await call(
  "POST",
  `/policies/pending-changes/${pendingId}/approve`,
  proposer.key,
  { stepUpAuthorization: await stepUpFor(pendingId) },
);
check(
  "the proposer cannot approve their own change",
  selfApproval.status >= 400 && selfApproval.status < 500,
  describe(selfApproval),
);

const approval = await call(
  "POST",
  `/policies/pending-changes/${pendingId}/approve`,
  approver.key,
  { stepUpAuthorization: await stepUpFor(pendingId) },
);
check(
  "a different human approves it with a signed step-up authorization",
  approval.status === 200,
  describe(approval),
);

// 3b. Approver governance: trust the refund manager's key, with no deploy.
const managerProposed = await call(
  "POST",
  "/approval-issuers/changes",
  proposer.key,
  {
    action: "add",
    approverId: manager.approverId,
    keyId: manager.keyId,
    publicKeyPem: manager.keys.publicKey
      .export({ format: "pem", type: "spki" })
      .toString(),
    reason: "Offline check: trust a refund manager.",
  },
);
check(
  "adding a refund manager key proposed by a verified human",
  managerProposed.status === 201,
  describe(managerProposed),
);

const managerChangeId = managerProposed.body?.changeId;
const managerApproval = await call(
  "POST",
  `/approval-issuers/changes/${managerChangeId}/approve`,
  approver.key,
  { stepUpAuthorization: await stepUpFor(managerChangeId) },
);
check(
  "a different human approves the manager key with a signed step-up authorization",
  managerApproval.status === 200,
  describe(managerApproval),
);

// 4. Authorized refund, with the manager's signed approval.
const before = await acceptedByStandIn();

const authorized = await refund({ amount: 500, managerApproved: true });
const authorizedResponse = await call(
  "POST",
  "/execute",
  operator.key,
  authorized,
);
check(
  "authorized refund executes",
  authorizedResponse.status === 200,
  authorizedResponse.status === 200 ? "HTTP 200" : describe(authorizedResponse),
);
check(
  "authorized refund reached the downstream system once",
  (await acceptedByStandIn()) === before + 1,
);

// 5. Refused refund: refused by the policy's rules, not by anything else.
const refused = await refund({ amount: 50000, managerApproved: false });
const refusedResponse = await call("POST", "/execute", operator.key, refused);
const refusedForPolicyRule =
  refusedResponse.status === 403 &&
  refusedResponse.body?.code === "POLICY_DENIED" &&
  !String(refusedResponse.body?.error).includes("PolicyChangeApprovalRecord");
check(
  "refused refund is rejected by the policy's rules",
  refusedForPolicyRule,
  describe(refusedResponse),
);
check(
  "refused refund never reached the downstream system",
  (await acceptedByStandIn()) === before + 1,
);

// 6. Trust Record, verified with only the public keys.
const record = await call(
  "GET",
  `/trust-records/${authorized.businessTransactionId}`,
  operator.key,
);
check("Trust Record stored", record.status === 200, `HTTP ${record.status}`);

if (record.status === 200) {
  writeFileSync("/out/trust-record.json", JSON.stringify(record.body, null, 2));
  writeFileSync("/out/default.public.pem", publicKeys.default);
  writeFileSync("/out/gateway.public.pem", publicKeys.gateway);

  const verification = await verifyExecutionTrustRecordOffline(
    record.body,
    publicKeys,
  );
  check(
    "Trust Record verifies with only the public keys",
    verification.valid,
    verification.valid ? "" : verification.errors.join("; "),
  );

  const tampered = JSON.parse(JSON.stringify(record.body));
  tampered.transaction.intent.parameters.amount = 5000;
  const tamperedVerification = await verifyExecutionTrustRecordOffline(
    tampered,
    publicKeys,
  );
  check(
    "a changed Trust Record fails verification",
    !tamperedVerification.valid,
  );
}

const passed = results.filter((result) => result.passed).length;
console.log(`\n${passed} of ${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
