/**
 * Writes the cURL, TypeScript and Python samples for the Policy version 2
 * operations (EXPERIMENTAL), one of each per operationId, in the places
 * scripts/add-openapi-code-samples.ts reads them from.
 *
 * Run: npx tsx scripts/openapi/generate-policy-v2-samples.ts
 *
 * The samples call the HTTP routes directly. The SDK does not wrap most of
 * these routes, and a sample must not call a method the SDK does not have.
 * Every body here is checked against its operation's request schema by
 * tests/architecture/openapi-code-samples.test.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { samplePaths } from "./codeSamples.js";

const ENDPOINT = "https://parmana-api-real.vercel.app";
const KEY_HEADER = "Authorization: Bearer $PARMANA_API_KEY";
const PEM =
  "-----BEGIN PUBLIC KEY-----\\nMCowBQYDK2VwAyEA...\\n-----END PUBLIC KEY-----";

interface Operation {
  readonly operationId: string;
  readonly method: "GET" | "POST";
  readonly route: string;
  /** Sent as the JSON body. Omitted for operations that take none. */
  readonly body?: string;
  /** False for the notification routes, which take no Parmana key. */
  readonly auth?: boolean;
  readonly comment: string;
}

const operations: readonly Operation[] = [
  {
    operationId: "policyV2Decide",
    method: "POST",
    route: "/v2/decisions",
    comment: "Record a decision",
    body: '{"capability":"erp:pay-invoice","transactionId":"txn-1001","target":"invoice-7781","parameters":{"amount":1200},"signals":{"vendorVerified":true}}',
  },
  {
    operationId: "policyV2GetReview",
    method: "GET",
    route: "/v2/reviews/review-123",
    comment: "Read a review",
  },
  {
    operationId: "policyV2DecideReview",
    method: "POST",
    route: "/v2/reviews/review-123/decision",
    comment: "Decide a review as a reviewer",
    body: '{"decision":"approve"}',
  },
  {
    operationId: "policyV2Replay",
    method: "GET",
    route: "/v2/evidence/record-123/replay",
    comment: "Replay a recorded decision",
  },
  {
    operationId: "policyV2Console",
    method: "GET",
    route: "/v2/console/home",
    comment: "Read a console screen (HTML)",
  },
  {
    operationId: "policyV2SesNotification",
    method: "POST",
    route: "/v2/notifications/ses",
    auth: false,
    comment: "Amazon SES posts this; clients do not call it",
    body: '{"Type":"Notification","Message":"{}"}',
  },
  {
    operationId: "policyV2NotificationEvents",
    method: "POST",
    route: "/v2/notifications/events",
    auth: false,
    comment: "Delivery events; clients do not call it",
    body: '[{"type":"Delivery"}]',
  },
  {
    operationId: "policyV2RegisterRead",
    method: "GET",
    route: "/v2/register",
    comment: "Read the register",
  },
  {
    operationId: "policyV2RegisterAudit",
    method: "GET",
    route: "/v2/register/audit",
    comment: "Read the register audit log",
  },
  {
    operationId: "policyV2GrantRole",
    method: "POST",
    route: "/v2/register/roles/grant",
    comment: "Grant a role",
    body: '{"callerId":"caller-ops-1","role":"reviewer"}',
  },
  {
    operationId: "policyV2RevokeRole",
    method: "POST",
    route: "/v2/register/roles/revoke",
    comment: "Revoke a role",
    body: '{"callerId":"caller-ops-1","role":"reviewer"}',
  },
  {
    operationId: "policyV2ProposeSource",
    method: "POST",
    route: "/v2/register/sources",
    comment: "Propose a source",
    body: `{"name":"erp-ledger","dataOwner":"Finance","signer":{"kind":"system"},"keyId":"erp-2026-01","publicKeyPem":"${PEM}","claims":{"invoiceAmount":"INR"},"canApprove":true}`,
  },
  {
    operationId: "policyV2ApproveSource",
    method: "POST",
    route: "/v2/register/sources/erp-ledger/approve",
    comment: "Approve a source",
  },
  {
    operationId: "policyV2RevokeSource",
    method: "POST",
    route: "/v2/register/sources/erp-ledger/revoke",
    comment: "Revoke a source",
    body: '{"reason":"Key rotated"}',
  },
  {
    operationId: "policyV2ProposeThreshold",
    method: "POST",
    route: "/v2/register/thresholds",
    comment: "Propose a threshold",
    body: '{"action":"erp:pay-invoice","name":"max-amount","value":5000,"unit":"INR","owner":"Finance","reason":"Limit payments without review","evidence":"Policy memo 2026-11","nextReview":"2027-05-01","highValue":true}',
  },
  {
    operationId: "policyV2ApproveThreshold",
    method: "POST",
    route: "/v2/register/thresholds/erp:pay-invoice/max-amount/approve",
    comment: "Approve a threshold",
  },
  {
    operationId: "policyV2RegisterAction",
    method: "POST",
    route: "/v2/register/actions",
    comment: "Register an action",
    body: '{"capability":"erp:pay-invoice","owner":"Finance","successor":"Finance Controller","reviewers":["reviewer-1"],"review":{"reviewWindowBusinessDays":2,"approvalValidityMinutes":120}}',
  },
  {
    operationId: "policyV2AddReviewer",
    method: "POST",
    route: "/v2/register/actions/erp:pay-invoice/reviewers",
    comment: "Grant a reviewer on an action",
    body: '{"reviewerId":"reviewer-1","maxAmount":10000}',
  },
  {
    operationId: "policyV2RevokeReviewer",
    method: "POST",
    route: "/v2/register/actions/erp:pay-invoice/reviewers/reviewer-1/revoke",
    comment: "Revoke a reviewer's grant",
    body: '{"reason":"Left the team"}',
  },
  {
    operationId: "policyV2RecordTest",
    method: "POST",
    route: "/v2/register/actions/erp:pay-invoice/tests",
    comment: "Record a passed test tier",
    body: '{"tier":"tier-1"}',
  },
  {
    operationId: "policyV2GoLiveGate",
    method: "GET",
    route: "/v2/register/actions/erp:pay-invoice/go-live",
    comment: "List what is missing before go-live",
  },
  {
    operationId: "policyV2GoLive",
    method: "POST",
    route: "/v2/register/actions/erp:pay-invoice/go-live",
    comment: "Take an action live, if its gate is met",
  },
  {
    operationId: "policyV2SetContact",
    method: "POST",
    route: "/v2/register/contacts",
    comment: "Set a contact",
    body: '{"personId":"person-1","email":"ops@example.com"}',
  },
  {
    operationId: "policyV2ProposePolicy",
    method: "POST",
    route: "/v2/register/policies",
    comment: "Propose a policy version. Replace {} with the policy document.",
    body: "{}",
  },
  {
    operationId: "policyV2ApprovePolicy",
    method: "POST",
    route: "/v2/register/policies/erp:pay-invoice/2.0.0/approve",
    comment: "Approve a policy version",
  },
  {
    operationId: "policyV2ProposeApproverKey",
    method: "POST",
    route: "/v2/register/approver-keys",
    comment: "Propose an approver key",
    body: `{"approverId":"approver-7","keyId":"key-2026-01","publicKeyPem":"${PEM}"}`,
  },
  {
    operationId: "policyV2ApproveApproverKey",
    method: "POST",
    route: "/v2/register/approver-keys/approver-7/key-2026-01/approve",
    comment: "Approve an approver key",
  },
  {
    operationId: "policyV2RevokeApproverKey",
    method: "POST",
    route: "/v2/register/approver-keys/approver-7/key-2026-01/revoke",
    comment: "Revoke an approver key",
    body: '{"reason":"Key compromised"}',
  },
];

const NOTE =
  "EXPERIMENTAL Policy version 2. Available only where the deployment enables it.";

function curl(op: Operation): string {
  const auth = op.auth === false ? "" : ` \\\n  -H "${KEY_HEADER}"`;
  const json =
    op.body === undefined
      ? ""
      : ` \\\n  -H "Content-Type: application/json" \\\n  -d '${op.body}'`;
  const method = op.method === "GET" ? "" : ` -X ${op.method}`;
  return [
    `# ${NOTE}`,
    `# ${op.comment}`,
    `curl${method} "${ENDPOINT}${op.route}"${auth}${json}`,
    "",
  ].join("\n");
}

function typescript(op: Operation): string {
  const headers: string[] = [];
  if (op.auth !== false)
    headers.push("Authorization: `Bearer ${process.env.PARMANA_API_KEY}`");
  if (op.body !== undefined) headers.push('"Content-Type": "application/json"');
  const bodyLine =
    op.body === undefined ? "" : `\n  body: JSON.stringify(${op.body}),`;
  const headerBlock =
    headers.length === 0 ? "" : `\n  headers: { ${headers.join(", ")} },`;
  return [
    `// ${NOTE}`,
    `// ${op.comment}`,
    `const response = await fetch("${ENDPOINT}${op.route}", {`,
    `  method: "${op.method}",${headerBlock}${bodyLine}`,
    "});",
    "console.log(response.status, await response.text());",
    "",
  ].join("\n");
}

function python(op: Operation): string {
  const headers: string[] = [];
  if (op.auth !== false) {
    headers.push(
      `"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"`,
    );
  }
  if (op.body !== undefined) headers.push('"Content-Type": "application/json"');
  const payload =
    op.body === undefined
      ? "None"
      : "json.dumps(json.loads(r'" + op.body + "')).encode('utf-8')";
  const imports = ["import urllib.request"];
  if (op.body !== undefined) imports.unshift("import json");
  if (op.auth !== false) imports.unshift("import os");
  // The request runs only as a script. Pytest collects files named *_test.py,
  // and an import-time request would hit the network during collection.
  return [
    `# ${NOTE}`,
    `# ${op.comment}`,
    ...imports,
    "",
    "",
    "def main() -> None:",
    `    request = urllib.request.Request(`,
    `        "${ENDPOINT}${op.route}",`,
    `        data=${payload},`,
    `        method="${op.method}",`,
    `        headers={${headers.join(", ")}},`,
    `    )`,
    "    with urllib.request.urlopen(request) as response:",
    `        print(response.status, response.read().decode("utf-8"))`,
    "",
    "",
    `if __name__ == "__main__":`,
    "    main()",
    "",
  ].join("\n");
}

function main(): void {
  for (const op of operations) {
    const files = samplePaths(op.operationId);
    for (const dir of [
      path.dirname(files.curl),
      path.dirname(files.typescript),
      path.dirname(files.python),
    ]) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(files.curl, curl(op), "utf8");
    writeFileSync(files.typescript, typescript(op), "utf8");
    writeFileSync(files.python, python(op), "utf8");
  }
  console.log(
    `generate-policy-v2-samples: ${operations.length} operations written in three languages.`,
  );
}

main();
