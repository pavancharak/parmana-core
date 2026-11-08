# Taking Parmana to a real system: what is required, and how to integrate it

Status as of 2026-11-08. Sources are the repositories' runbooks, [`docs/internal/project/CURRENT-STATE.md`](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/project/CURRENT-STATE.md), [`docs/internal/OPEN-ITEMS.md`](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/OPEN-ITEMS.md), [`docs/internal/VERIFICATION-GAPS.md`](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md), and the code the sections name.

---

## Part A. Where things stand

Parmana's core pipeline works in this repository, and its own documents describe it as tested and partly deployed. It is not yet a finished production system for real money. The repositories' own status documents say so:

- **Built and working:** the policy-decision pipeline, signed authorizations, the connector gateway, signed trust records, human approval with a signed step-up, policy governance through maker-checker, external connectors, business-validation signal sources, and the operator kill switch.
- **Deployed:** a production API on Vercel (`parmana-api-real`), a self-hosted Docker path, and a kill switch that has been live in production since 2026-10-20 with the switch not tripped.
- **Known gaps before real money:** the open P1 items in the gap log. Section B lists them.
- **Does not exist:** multi-tenant isolation, a performance or load-test harness with results, and a compiled operator CLI. Both documents state these plainly, so a production plan must provide them.

Read section B before any live use.

## Part B. What is required before live use

Each item is a gate. Do not move a real business action through Parmana until the gate it belongs to is closed.

### B1. Gaps the repositories list as open P1

| Gap                                           | Issue | Why it blocks live use                                                                  | State                                                                             |
| --------------------------------------------- | ----- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| G-51: most signals are caller-declared        | #368  | A caller can declare a fact that a policy trusts                                        | Partly closed. `managerApproved` is verified. Other signals are not               |
| G-93: grants are opt-in, limits per request   | #366  | An agent's total spend is not capped across requests                                    | Open. Cumulative limits are not built                                             |
| G-118: attestation key in the calling process | #385  | Code in the API process can sign a release without going through the gateway            | Open. Needs a separate process or hardware-backed signer                          |
| G-121: external verifiers read only schema v2 | #387  | Outside verifiers cannot check schema v3 records                                        | Open. Needs releases in the external verifier                                     |
| G-92: no real business system connected       | #365  | Only a demo source has been verified                                                    | Open                                                                              |
| G-81: external connector not checked live     | #364  | The connector path is verified in code, not against a live endpoint                     | Open. Needs a live check                                                          |
| G-108: audit chain tail truncation            | #381  | Deleting the newest audit rows is not detectable from the database alone                | Code exists. The chain head must be published outside the database. Operator step |
| G-122: kill switch gap                        | #388  | A trip that lands between the guard and the connector call can still release one action | Partly closed. Two-person reset not yet tested with two real keys                 |
| G-65: refused requests cannot be escalated    | #363  | No path from refusal to a person's approval                                             | Built for refunds. Needs deployment with a real approver                          |
| G-141: injected instructions                  | #433  | Limit documented and tested                                                             | Closed on `main` via PR #513                                                      |

### B2. Key and approver setup (the key-list ceremony)

These are not optional. The repository's OPEN-ITEMS document has a "Key-list ceremony" section.

- **Named, individual operators.** Each operator has their own key. The kill switch's two-person reset only works if the two operators are different people, so do not share keys.
- **Approver keys.** Each approver generates an Ed25519 key with [`scripts/generate-approver-key.ts`](https://github.com/pavancharak/parmana-core/blob/main/scripts/generate-approver-key.ts), keeps the private key on their own machine, and registers the public key through the approval-issuer flow (`propose-issuer`, then `approve-issuer`). Only issuers in `TRUSTED_APPROVAL_ISSUERS` can sign.
- **Checker scope.** `POLICY_CHANGE_CHECKERS` lists, per policy, the callers allowed to approve it. An unset value lists no one, so approval is refused until it is configured.
- **Step-up keys.** Each checker has a step-up key, held on their machine. The step-up envelope expires in at most 120 seconds.
- **The kill switch's second operator.** Production sets `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR=true`, so a reset needs two different operators. Right now a stand-in entry exists for `operator-b`. Replace it with a real operator's key before relying on the second-operator reset (gap G-122).
- **Never** paste a private key or a secret into chat, a document, or a commit.

### B3. Infrastructure

| Requirement           | Where it is set                                                                                                   | Check                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Node.js 24            | `engines` in [`package.json`](https://github.com/pavancharak/parmana-core/blob/main/package.json), CI, Dockerfile | `node -v` shows 24.x                            |
| A production database | `PARMANA_STORAGE=postgres` (`supabase` selects the same Postgres storage)                                         | `npm run db:migrate` completes                  |
| Signing keys          | `PARMANA_KEY_DIR` or KMS                                                                                          | `npm run verify:kms` passes, when KMS is used   |
| Caller API keys       | `PARMANA_API_KEYS` (hashed, with a `keyHash` per caller)                                                          | `npm run generate:api-key` makes the entries    |
| Kill switch           | `KILL_SWITCH_ENABLED=true`, `DATABASE_URL`, `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR`                             | The probe runs and reports `active: false`      |
| Alerts                | `ALERT_WEBHOOK_URL` (https) and `ALERT_WEBHOOK_SECRET`                                                            | A test alert reaches the receiver               |
| Policy governance     | `POLICY_CHANGE_CHECKERS`                                                                                          | An approval by an in-scope checker succeeds     |
| Startup checks        | `npm run doctor -- --production --online`                                                                         | Every line passes, with none marked "to review" |

**Two deployment entry points, one rule.** The Vercel entry ([`api/index.ts`](https://github.com/pavancharak/parmana-core/blob/main/api/index.ts)) and the self-hosted entry ([`packages/api/src/server.ts`](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/server.ts)) must take the same startup options. The repository has been bitten twice when one was missed. After any change to either, run:

```bash
npx vitest run tests/architecture/vercel-entry-policy-checkers.test.ts
```

**Node version on Vercel.** The Vercel project setting can override `engines`. At the time of the Node version runbook, production ran on Node 26.x while the repository pins 24.x. Decide the version deliberately and record it. See [`docs/internal/runbooks/NODE-VERSION.md`](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/NODE-VERSION.md).

### B4. Deployment and rollback

Follow [`docs/internal/runbooks/PRODUCTION-DEPLOY-AND-ROLLBACK.md`](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/PRODUCTION-DEPLOY-AND-ROLLBACK.md).

- Production deploys from `main`. Do not deploy from a laptop.
- To apply new environment values to the current build, use `vercel redeploy`, not a fresh build. Environment changes apply only to new deployments.
- After a deploy, check the deployment, using section 3 of that runbook.
- To roll back, use section 4 of that runbook.
- Startup failures (`FUNCTION_INVOCATION_FAILED`) are covered in section 5.

### B5. Live money

- **Start in test mode.** Every Razorpay path in the repositories refuses live keys unless explicitly allowed (`PARMANA_ALLOW_LIVE_KEYS=true`).
- **A live run needs approval.** The connectors README says live keys are used only after a live test is approved. No live run is recorded.
- **Limits.** Grant limits apply per request. Cumulative limits are not built (G-93). Until they are, set a conservative per-request limit and monitor totals outside Parmana.

### B6. Governance, legal and operations

- **Records.** Each change is a pull request that updates the claims, gaps and remaining-work documents (see [`CONTRIBUTING.md`](https://github.com/pavancharak/parmana-core/blob/main/CONTRIBUTING.md)).
- **Monitoring.** Alerts (B3) cover decisions and kill switch trips. They are best effort with no queue, so monitor the receiver too.
- **Incident response.** The incident export ([`docs/internal/runbooks/INCIDENT-EXPORT.md`](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/INCIDENT-EXPORT.md)) pulls signed records for a time window. Run its timed drill before you depend on it.
- **Multi-tenant use.** Not supported. One deployment serves one organization.
- **Load.** No load-test results exist. Run `npm run loadtest` against your own configuration, and record the numbers yourself before any capacity claim.
- **Regulatory.** The repositories map against draft CERT-In AI security guidelines ([`docs/site/security/cert-in-mapping.mdx`](https://github.com/pavancharak/parmana-core/blob/main/docs/site/security/cert-in-mapping.mdx)). Those are drafts. Get your own legal and compliance review.

## Part C. How to integrate Parmana into an application

Parmana sits between an agent or application and the business system. The application asks Parmana for an action. Parmana decides, signs the decision, and only then does the connector act.

### C1. The pieces

| Piece         | What you provide                                                         | Where it lives                                                                 |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Policy        | Rules: which capability, which signals, which approvals                  | `policies/<name>/<version>/policy.json`, approved through maker-checker        |
| Capability    | A name (for example `razorpay:refund`) bound to an endpoint and a policy | Registered through maker-checker                                               |
| Connector     | The code that performs the action                                        | A separate service (for example `parmana-connectors`), with its own credential |
| Signal source | An outside system that establishes facts a policy needs                  | Registered through maker-checker                                               |
| Caller        | The application or agent, with its API key                               | `PARMANA_API_KEYS`, one entry per caller                                       |
| Grant         | Permission for a caller to use a capability, with a limit and an expiry  | Proposed and approved through maker-checker                                    |
| Approver      | A human whose signature covers one action                                | `TRUSTED_APPROVAL_ISSUERS`                                                     |

### C2. Integration steps, in order

**Step 1. Decide the action and its policy.** Write down what the agent may do, what it must never do, which facts must be trusted, and who must approve. Each of these becomes part of the policy. Start from an existing policy in the repository, such as the demo `razorpay-refund` draft, and adapt it.

**Step 2. Write and test the policy locally.** Validate it with `PolicyValidator`, and run the policy package's tests. Keep the policy file under version control.

**Step 3. Propose the policy.** The maker runs the governance script, or calls the pending-changes route for the policy. A checker reviews the change and approves it with a step-up signature (see the maker-checker chapter for the exact steps).

**Step 4. Register the capability.** Propose the capability with its endpoint URL, its policy, and its allowed parameters. The endpoint must verify Parmana's signed release (signature, audience, capability, expiry) and act only on the parameters the capability allows. The connectors repository has a working example.

**Step 5. Register any signal source.** If the policy relies on an outside fact, register the source through maker-checker. The source answers signed queries, and Parmana checks each answer against the registered key.

**Step 6. Create the caller and its key.** Add a caller to `PARMANA_API_KEYS`, with only the capabilities it needs. Give the key to the application through a secret store, never through code or chat.

**Step 7. Grant authority.** Propose and approve a grant for the caller: the capability, a per-request maximum, and an expiry. A policy that requires a grant refuses requests without one.

**Step 8. Send a request from the application.** The SDK builds a business transaction, sends it, and returns either an approval or a refusal, each with a signed record. The demo's agent (`examples/razorpay-refund-agent/agent.ts`) shows the pattern:

- Check the input locally first. Refuse anything malformed before calling Parmana.
- Call `execute` with the transaction.
- On approval, store the record. On refusal, read the refusal record and the rule that refused.
- Never retry a refused request with a different approval hoping for a different result.

The TypeScript SDK exposes the client used there (`ParmanaClient`, with `caller`, `policyInEffect`, `execute` and `refusalRecord`). The Python SDK has equivalent operations.

**Step 9. Verify the record offline.** Each approved or refused decision has a signed record. Verify it without calling the server, using the SDK's offline verifier:

- TypeScript: `verifyExecutionTrustRecordOffline` in [`typescript/src/crypto/offline-verifier.ts`](https://github.com/pavancharak/parmana-core/blob/main/typescript/src/crypto/offline-verifier.ts).
- Python: `verify_execution_trust_record_offline` in [`python/parmana/crypto/offline_verifier.py`](https://github.com/pavancharak/parmana-core/blob/main/python/parmana/crypto/offline_verifier.py).

Keep Parmana's public key with the records. A verifier needs that key, not the server.

**Step 10. Monitor.** Turn on the alert webhook (B3). Watch the receiver. Check the kill switch probe regularly.

**Step 11. Test in test mode, then a limited live trial.** Run the four-case demo (approval, no approval, over the limit, replay) against your own configuration. Only then consider a live trial, which needs an explicit decision and a per-request limit you can afford to lose.

### C3. What the application must not do

- Hold a business system's credential. The connector holds it.
- Hold an approver's key. A human signs approvals on their own machine.
- Declare a fact to Parmana and expect it to be trusted for money. Trusted facts come from an independent source or a signed approval.
- Treat a refusal as a transient error. A refusal is a decision with a reason, recorded in a signed record.

## Part D. A production checklist

- [ ] Every gate in B1 is closed, or accepted in writing by the owner, with its risk noted
- [ ] Each operator has a named key, and the stand-in `operator-b` entry is replaced
- [ ] `POLICY_CHANGE_CHECKERS` and `TRUSTED_APPROVAL_ISSUERS` list only people who should approve
- [ ] `npm run doctor -- --production --online` passes with no item to review
- [ ] Alerts reach the receiver, and a test alert has been received
- [ ] The kill switch probe runs on schedule and reports `active: false`
- [ ] The incident export and its drill have been run
- [ ] Node version is decided and recorded, and Vercel matches it
- [ ] A rollback has been rehearsed, using the deploy runbook
- [ ] Test-mode runs pass for every capability, including the refusal cases
- [ ] Limits are set per request, and totals are monitored outside Parmana until G-93 is closed
- [ ] Legal and compliance review is done, and any draft guideline is treated as a draft

## Part E. Limits you must plan around

- **No multi-tenant isolation.** One deployment, one organization.
- **Caller-declared signals.** Only the signals named as verified are trusted. Check each policy's `signalSources` and `approvalSignals`.
- **Approval fatigue.** A reviewer can approve many requests without reading each one. The repository lists this as an open gap (G-135).
- **Kill switch scope.** A trip stops new requests. An action already past the guard can still complete (G-122).
- **Replay ledger.** A release recorded but not confirmed cannot be resent. The operator must check the business system by hand (connectors [`RUNBOOK.md`](https://github.com/pavancharak/parmana-connectors/blob/main/RUNBOOK.md)).
- **Vercel and self-hosted differ** unless the startup options are kept in step (B3).
