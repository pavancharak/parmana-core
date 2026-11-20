# Frequently asked questions

[Portal home](README.md) · [Glossary](glossary.md) · [Troubleshooting](troubleshooting/README.md)

The first thirteen questions are the ones a developer new to Parmana should be able to answer from this portal alone. The answers are short, and each one links to the page that has the detail and the evidence.

## Starting out

### 1. What is Parmana?

An execution integrity layer. Before an application or an AI agent performs a business action, Parmana checks that the action is declared, that the authority for it is established (with a signed human approval where the policy requires one), and that the organization's policy approves it. Approved actions are released through a connector, and each execution produces a signed, verifiable record. See [Overview](overview.md).

### 2. Why should I integrate it?

When an automated system acts on your behalf, you need to show afterwards who approved the action, under which policy, and that the record has not been changed. Parmana gives you that as signed evidence, which you can check without trusting the system that ran the action. See [Overview: why Parmana exists](overview.md#why-does-parmana-exist).

### 3. Where does Parmana run?

The API server runs as a Node.js 24 process, or as a container, with PostgreSQL for durable storage. You can run it on your own machine (from a repository checkout), on your own infrastructure, or use a hosted deployment if your operator provides one. The server is not published as a package. See [Deployment](deployment/README.md).

### 4. How do I connect my application?

Install an SDK (`npm install @parmana/sdk@4.1.1` or `pip install "parmana==4.1.1"`), and create a client with the endpoint and your caller key. The endpoint must be `https://` except on your own machine. The key comes from your operator. See [Getting started](getting-started.md#2-install-an-sdk).

### 5. Where do organizational policies live?

In a policy directory on the server, set by `PARMANA_POLICY_DIR`, as `<name>/<version>/policy.json`. The organization writes each policy and approves each version through maker-checker. Approving a version writes its file. See [Policy management](policies/README.md#where-policies-live).

## Using the SDK

### 6. How do I call an SDK function?

Create the client once, and call its methods with the arguments the method documents. In TypeScript: `await client.execute(transaction)`. In Python: `client.execute(transaction)`. Every method is listed, with its signature and the request it sends, in the [TypeScript](sdk/typescript-method-index.md) and [Python](sdk/python-method-index.md) method indexes.

### 7. How do I submit an authorization request?

Build a Business Transaction with the builder (`createBusinessTransaction` or `create_business_transaction`), attach the approval in `signals` if the policy needs one, and call `execute`. To record the request first and decide later, call `declareTransaction` and then `executeTransaction`. A declared transaction must already carry its approval. See [Getting started: submit a Business Transaction](getting-started.md#6-submit-a-business-transaction).

### 8. How do I implement maker-checker?

The maker proposes the policy version (`proposePolicyChange`). A different, listed checker signs a step-up envelope on their own machine and approves it (`approvePolicyChange` with the envelope). The maker cannot approve their own change, and the checker must be a human. The operator can do the same from the command line with `parmana-ops`. See [Maker-checker](tutorials/maker-checker.md).

### 9. What happens when authorization fails?

The request is refused and nothing runs. Over HTTP the response is `401` (no or unknown key), `403` (a permission, a policy decision, an approval that does not verify, or a maker-checker rule), `404` (a missing record, policy or binding), `409` (a repeated transaction id), or `429` (rate limit). The SDK raises the matching error class, and an `ExecutionRejectedError` carries the policy's reason. See [Error codes](reference/error-codes.md).

### 10. How do I execute an authorized action?

Call `execute` (one call) or `declareTransaction` followed by `executeTransaction`. The response is the signed Execution Trust Record. Your application then performs or records the business step, using the record as the reference. Parmana releases the action through its connector, so the business system does not need Parmana's key. See [Getting started](getting-started.md#6-submit-a-business-transaction) and [Architecture](architecture.md#1-request-path-application--sdk--service--decision--execution).

### 11. How do I retrieve execution evidence?

Call `trustRecord(businessTransactionId)` (TypeScript) or `trust_record(...)` (Python), or `GET /trust-records/{businessTransactionId}`. For a bulk export, `GET /trust-records` with a date range. For a refused request, `GET /refusal/{businessTransactionId}`. See [API: trust records](api/endpoints.md#trust-records-and-refusals).

### 12. How do I independently verify that evidence?

Pin the public key you trust, by its fingerprint, from a second source. Then run the standalone verifier (`npx @parmana/verifier@2.0.3 record.json trust.json`), or the SDK's offline function (`verifyExecutionTrustRecordOffline`, `verify_execution_trust_record_offline`). Read `valid` and `coverage`. Schema 3 records give full coverage; schema 2 records give legacy coverage, which does not protect every field. See [Evidence verification](security/evidence-verification.md).

### 13. How do I troubleshoot integration problems?

Start with the status code and the server's `code`. Then run the debugging checklist: is the server up, is it ready, does my key work, is the policy version in effect, what is the transaction's status, was it refused, does the record verify. See [Troubleshooting](troubleshooting/README.md#debugging-checklist).

## More questions

### Does Parmana run the business action itself?

No. Parmana decides whether an action may run and records the decision. Released actions go through a connector to the business system. The connectors live in the `parmana-connectors` repository. See [Architecture](architecture.md#components).

### Can an AI agent approve its own actions?

No. An approval is signed by a person, on their own machine, with their own key. The agent carries the approval as data, and the server verifies it. Tutorial 120 shows a declared `humanApproved: true` without a verified approval being refused. See [AI agents](tutorials/ai-agents.md).

### Can an agent be given a key that runs anything?

Give an agent a key with only the capabilities it needs (`allowedCapabilities`) and the principals it may act for (`allowedPrincipalIds`). Parmana checks both on every request. Do not give a service key the human-only governance routes. See [Deployment: checklist](deployment/README.md#operational-checklist).

### Do I have to use the Python or the TypeScript SDK?

No. Every operation is an HTTP route described by the OpenAPI document. The SDKs are convenience layers over those routes. Use the REST API directly from any language, and see the [endpoint index](api/endpoint-index.md) for the 66 operations.

### Can I retry a request that failed?

It depends on the status. Retry a `GET` freely. Do not retry a `POST` that executes an action with a new transaction id, because that runs the action again. For a `409`, read the existing outcome. For a `202`, `500` (`EXECUTION_RECORD_INCOMPLETE`) or `502` (`EXECUTION_OUTCOME_UNKNOWN`), read the status and reconcile. See [Error codes](reference/error-codes.md#http-status-summary).

### Why was my policy version refused as "superseded"?

Only the version most recently approved for a policy name is in effect. You named an older one. Name the version in effect, or approve the version you want. See [Policy management](policies/README.md#versions-and-the-version-in-effect).

### Why does my approval not count?

An approval counts only if Parmana can verify it for this request. The signature must be valid, the approver must be trusted by the server, the capability and target must match, the amount must be covered, the approval must not have expired, and it must not have been used before. An approval cannot be attached to a transaction after it was declared. See [Troubleshooting: approval failures](troubleshooting/README.md#approval-failures).

### What does `coverage: legacy` mean?

The record is schema version 2. Its signatures protect only seven top-level fields. A change to another field, such as `updatedAt`, is not detected. The default configuration of this build produces these records. Schema 3 with hybrid signatures gives `coverage: full`, and it is opt-in. See [Security: schema versions](security/README.md#schema-versions-and-coverage).

### Does `valid: true` mean the business action happened?

No. It means the record's covered content and its signatures check out with the keys you trust. Whether the action happened is shown by the connector's own records, and the correspondence report shows whether what was dispatched matches what was authorized. See [Evidence verification: what it proves](security/evidence-verification.md#what-verification-proves-and-what-it-does-not).

### Can I use Parmana with memory storage in production?

No. Memory storage loses every transaction, record and approval on restart. Verified in this portal: a transaction created before a restart returned `404` after it. Use PostgreSQL for any deployment. See [Deployment: PostgreSQL](deployment/README.md#postgresql).

### What version of Parmana is this?

The SDK and package versions are 4.1.1. The verifier is 2.0.3. The server's `GET /version` reports `0.4.0` on the build this portal verified, which does not match. See [COVERAGE](COVERAGE.md#known-issues-found-during-this-review).

### Is there a Java or Go SDK?

Not in this repository. The API manifest lists `go` and `java` as `null`. Use the REST API directly, or the TypeScript or Python SDK. See [SDKs](sdk/README.md).

### Where do I report a security issue?

Through [SECURITY.md](../../SECURITY.md), not in a public issue. The repository's [THREAT-MODEL.md](../../THREAT-MODEL.md) describes what Parmana is designed to resist, and where its limits are.
