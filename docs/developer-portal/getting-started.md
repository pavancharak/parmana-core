# Getting started

[Portal home](README.md) · [Overview](overview.md) · [Tutorials](tutorials/README.md)

This guide takes you from nothing to a verified execution on your own machine. Every command below was run in the verification for this portal. The steps are in order, and each one ends with something you can check.

You will:

1. install an SDK,
2. start a local Parmana server with test configuration,
3. connect and confirm the caller,
4. make a maker-checker approval of a policy version,
5. submit a Business Transaction, declare it, and execute it,
6. verify the resulting evidence, by the server and offline.

> **Local only.** The steps use test configuration (`NODE_ENV=test`, in-memory storage, a test approver key, a test connector). They prove the flow works. They are not a production setup. See [Deployment](deployment/README.md) for production.

## 1. Prerequisites

| Need                                        | Version                                                                     | Check                    |
| ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| Node.js                                     | 24.x (the repository's `.nvmrc` pins a 24.x release; `engines` requires 24) | `node --version`         |
| npm                                         | 10 or later (ships with Node 24)                                            | `npm --version`          |
| Python, for the Python SDK                  | 3.10 or later                                                               | `python3 --version`      |
| Git                                         | any recent version                                                          | `git --version`          |
| Docker with Compose, for the container path | optional                                                                    | `docker compose version` |

The verification ran on Linux with Node 24.22.3 and Python 3.13. Windows is not verified; the repository notes that WSL 2 is the safer route on Windows.

## 2. Install an SDK

Pick the language of your application. You can use both.

**TypeScript or JavaScript (Node.js 24 or later):**

```bash
npm install @parmana/sdk@4.1.1
```

**Python (3.10 or later):**

```bash
pip install "parmana==4.1.1"
# Add the verification extra if you will sign approvals or step-up envelopes in Python:
pip install "parmana[verify]==4.1.1"
```

**Check the install:**

```bash
node -e "import('@parmana/sdk').then(m => console.log(m.VERSION))"
python3 -c "import parmana; print(parmana.__version__)"
```

Both print `4.1.1`. These packages are on the public registries, and the install was checked in a fresh directory. The full reference for each is in [SDKs](sdk/README.md).

## 3. Start a local server

The API server is not published as a package. You run it from a checkout of this repository (or with Docker, see [Deployment](deployment/README.md)).

```bash
git clone https://github.com/pavancharak/parmana-core.git
cd parmana-core
npm ci
npm run build
```

Create the local configuration. This writes a signing key, a gateway key, a test approver key, a copy of the example policies, and two caller keys, all into `~/.parmana/governed-quickstart`, outside the repository:

```bash
node docs/developer-portal/examples/governed-quickstart/setup.mjs
```

The script prints the exact start command. Start the server in its own terminal and leave it running:

```bash
bash ~/.parmana/governed-quickstart/start-server.sh
```

You should see `API running on http://0.0.0.0:3000`.

**Check that it is up.** This needs no key:

```bash
curl -s http://localhost:3000/health
# {"status":"UP"}
```

> **Why the script?** The existing [quickstart](../site/quickstart.mdx) needed several fixes to run: the policy and key directories are now in its command, the approver generator creates its folder, and its warning explains the approval step. The governed setup here still does more: it creates a second caller and a checker, so the approval flow runs end to end without the quickstart's manual steps. The gaps and their status are in [Troubleshooting](troubleshooting/README.md#the-existing-quickstart-did-not-run-as-written-now-corrected).

## 4. Connect and confirm your caller

Every route except `/health`, `/ready` and the OpenAPI and documentation routes requires a bearer key. The key is in `raw-keys.json` in the configuration directory. Send it as `Authorization: Bearer <key>`. The server stores only a SHA-256 hash of each key.

```bash
RAW_DEMO=$(node -e "console.log(require(process.env.HOME + '/.parmana/governed-quickstart/raw-keys.json').demo)")
curl -s -H "Authorization: Bearer $RAW_DEMO" http://localhost:3000/callers/me
# {"callerId":"demo","allowedPrincipalIds":["demo"],"allowedCapabilities":["test:fixture-execute"],"unrestrictedCapabilities":false}
```

`allowedCapabilities` lists the actions this key may request. `allowedPrincipalIds` lists the principals it may act for. A request outside either list is refused.

Now connect from code. The SDK sends the key on every call.

**TypeScript:**

```typescript
import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "http://localhost:3000", // https:// is required for any host except localhost
  apiKey: process.env.PARMANA_API_KEY,
});

const caller = await client.caller();
console.log(caller.callerId, caller.allowedCapabilities);
```

**Python:**

```python
import os
from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="http://localhost:3000",  # https:// is required for any host except localhost
    api_key=os.environ["PARMANA_API_KEY"],
)

caller = client.caller()
print(caller.caller_id, caller.allowed_capabilities)
```

The SDKs refuse an endpoint that is not `https://`, except `localhost`, `127.0.0.1` and `[::1]`. The TypeScript SDK also refuses credentials embedded in the URL (`assertSafeEndpoint`).

## 5. Approve a policy version (maker-checker)

A policy version does not take effect until a second person approves it. The server will not execute against a version that has no approval record. This is the rule that makes the policy an organizational decision and not a developer's.

This step is performed by the example. Run it once from the repository root:

```bash
npx tsx docs/developer-portal/examples/governed-quickstart/typescript/governed-flow.ts
```

Its output, in order:

```text
1. maker proposes vendor-payment@2.1.0
   pending change: <id>
2. maker tries to approve its own change (expected to be refused)
   refused as expected: AuthorizationError (HTTP 403): ... may not also approve or reject it (checker).
3. checker approves with a step-up signature
   status: APPROVED
4. demo caller executes an approved action
   trust record: <id>
   outcome: APPROVED
5. verification
   server verification: VERIFIED
   offline (SDK): valid=true coverage=legacy hashValid=true legacySignatureValid=true
6. the same transaction is submitted again (expected to be refused)
   refused as expected: ConflictError (HTTP 409): ... already exists.
```

The same flow in Python is `python3 docs/developer-portal/examples/governed-quickstart/python/governed_flow.py`. The maker, checker and demo keys are separate, and each can do only what its role allows. The step is explained in full in the [maker-checker tutorial](tutorials/maker-checker.md).

## 6. Submit a Business Transaction

There are two ways to ask Parmana to act. Both go through the same checks.

- **Execute in one call** with `execute()` (`POST /execute`). The decision and the release happen in that call.
- **Declare, then execute.** `declareTransaction()` records the request as `RECEIVED` and decides nothing. `executeTransaction()` then decides and releases. Use this when the application must record the request before anything runs.

`governed-flow.ts` used the one-call form. This example uses the two-step form:

```bash
GOVERNED_POLICY_VERSION=2.1.0 npx tsx docs/developer-portal/examples/governed-quickstart/typescript/declare-then-execute.ts
```

```text
1. declare <businessTransactionId>
   status: RECEIVED
2. status
   current: RECEIVED (stage declare)
3. execute
   trust record: <id>
   outcome: APPROVED
4. status after execution: VERIFIED (6 events in history)
```

The request in `declare-then-execute.ts` is built with the public helper and is the shape you will use in your own code:

```typescript
import { randomUUID } from "node:crypto";
import {
  ParmanaClient,
  createBusinessTransaction,
  signApproval,
} from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "http://localhost:3000",
  apiKey: process.env.PARMANA_API_KEY,
});

// The human approver signs, on the approver's own machine. The agent never holds this key.
const approval = signApproval({
  privateKeyPem: approverPrivatePem, // the approver's Ed25519 private key (PEM); read from a file, as in declare-then-execute.ts
  approverId: "local-test-approver",
  keyId: "local-test-approver-key-1",
  capability: "test:fixture-execute", // the action this approval covers
  resourceId: "vendor://payments", // the target this approval covers
  maxAmount: 250, // the largest amount this approval covers
});

const transaction = createBusinessTransaction({
  businessTransactionId: randomUUID(),
  principalId: "demo",
  purpose: "Declare then execute",
  action: "test:fixture-execute",
  target: "vendor://payments",
  parameters: { amount: 250, currency: "USD" },
  policy: { name: "vendor-payment", version: "2.1.1", schemaVersion: "1.0.0" },
  signals: {
    humanApproved: true,
    approvalArtifact: approval,
    vendorVerified: true,
    invoiceVerified: true,
    paymentApproved: true,
    sufficientFunds: true,
    paymentAmount: 250, // must equal parameters.amount
    riskScore: 5,
    vendorId: "vendor://payments", // must equal target
  },
});

const declared = await client.declareTransaction(transaction);
const record = await client.executeTransaction(declared.businessTransactionId);
```

Two things to note:

- **The policy version must be the one in effect.** This server executes only the most recently approved version of a policy. If you approve `2.1.1` after `2.1.0`, a request naming `2.1.0` is refused with `was superseded`. That is intended. See [Policy management](policies/README.md#versions-and-the-version-in-effect).
- **The business transaction id is single-use.** Submitting the same id again returns `409 Conflict`, and nothing runs again.

## 7. Verify the evidence

Every execution produces an Execution Trust Record. Verify it in two ways.

**a) By the server.** The server re-checks the stored record:

```typescript
const verification = await client.verify(record.businessTransactionId);
console.log(verification.status); // VERIFIED
```

**b) Offline, without the server.** Pin the deployment's public key, then check the record against it. The SDK does this with no network access:

```typescript
import { verifyExecutionTrustRecordOffline } from "@parmana/sdk";

const published = await client.publicKey("default"); // the key you pin, out of band in production
const offline = verifyExecutionTrustRecordOffline(record, {
  default: published.pem,
});
console.log(offline.valid, offline.coverage, offline.errors);
// true "legacy" []
```

**c) With the standalone verifier,** which has no dependency on the Parmana SDK:

```bash
bash docs/developer-portal/examples/governed-quickstart/verify-standalone.sh
```

The script pins the key by its fingerprint, verifies the record it saved, then verifies a copy with one amount changed:

```text
== record as written (expect valid: true, exit 0)
{"valid":true,"coverage":"legacy","errors":[],...}
exit 0

== record with the amount changed (expect valid: false, exit 1)
{"valid":false,"coverage":"legacy","errors":["trustRecordHash mismatch: ...", ...],...}
exit 1 (rejected, as expected)
```

**Read the `coverage` field.** `legacy` means the record is a schema version 2 record, which signs only seven top-level fields. The default configuration produces that version, and the hybrid configuration with schema version 3 produces `full` (see [Security](security/README.md#schema-versions-and-coverage)). The standalone verifier refuses it unless you set `allowLegacyV2` and `allowLegacyOnly` in the trust file, and the script does that deliberately. The SDK's offline check reports `valid: true` for it, so your code must check `coverage` itself if it needs every field covered. The full rules are in [Evidence verification](security/evidence-verification.md).

## 8. Where to go next

- Build an integration: [Node.js](tutorials/nodejs-integration.md), [Python](tutorials/python-integration.md), or [Fintech](tutorials/fintech-integration.md).
- Learn the limits: [Transaction limits](tutorials/transaction-limits.md) and [Refund authorization](tutorials/refund-authorization.md).
- Give an agent a bounded capability: [AI agents](tutorials/ai-agents.md).
- Understand what to expect on failure: [Troubleshooting](troubleshooting/README.md).
- Run it for real: [Deployment](deployment/README.md) and [Security](security/README.md).

## Stopping the server

Press Ctrl+C in the terminal that runs `start-server.sh`. Delete `~/.parmana/governed-quickstart` to start from clean keys and an empty approval state. The state is in memory, so restarting the server also clears it.
