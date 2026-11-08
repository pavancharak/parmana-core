# Parmana glossary: concepts, terms, and where to read more

Each term links to the file that defines or implements it. Links point to `main` in the repository named, unless the link says it points to a branch. A link to a branch file exists only while that branch exists.

Repository shorthand used below:

- **core** = [`parmana-core`](https://github.com/pavancharak/parmana-core)
- **connectors** = [`parmana-connectors`](https://github.com/pavancharak/parmana-connectors)

---

## A. Core ideas

**Action.** Something an agent wants done in a business system, such as a refund. Parmana decides whether it may run.
Read: [CONTRIBUTING.md](https://github.com/pavancharak/parmana-core/blob/main/CONTRIBUTING.md) (the project's purpose and principles).

**Agent.** An AI system that asks Parmana for actions. It holds no business credential and no approval key. Example: [the demo refund agent](https://github.com/pavancharak/parmana-core/blob/a4df45341381c500ffb6ab9554b56622cc8e622d/examples/razorpay-refund-agent/agent.ts) (on the commit before its removal).

**Decision.** Parmana's answer to a request: approved or refused, with a reason. Each decision is recorded.
Read: [RuntimeEngine.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/runtime/src/RuntimeEngine.ts) (`execute`).

**Release.** Parmana's signed instruction that tells a connector to act. Names the capability, the target, the parameters, an expiry, and the connector's audience.
Read: [connectors README, "How it is used"](https://github.com/pavancharak/parmana-connectors/blob/main/README.md).

**Trust record.** The signed record of a decision and what followed. Verifiable offline.
Read: [trust-records route](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/routes/trust-records.ts), and the offline verifiers in [TypeScript](https://github.com/pavancharak/parmana-core/blob/main/typescript/src/crypto/offline-verifier.ts) and [Python](https://github.com/pavancharak/parmana-core/blob/main/python/parmana/crypto/offline_verifier.py).

**Refusal record.** The signed record of a refused request, with the rule that refused it.
Read: [CLAIMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md) (search for "Refusal").

**Claim.** A statement about what Parmana guarantees, written only when code and tests back it. Each claim lists its evidence.
Read: [docs/internal/CLAIMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md).

**Gap (verification gap).** A known weakness, recorded with an ID such as G-108. Open gaps block production use until closed.
Read: [docs/internal/VERIFICATION-GAPS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md).

**P1 / P2 / P3.** Priority labels on open issues. P1 is the highest.
Read: [docs/internal/OPEN-ITEMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/OPEN-ITEMS.md).

**ADR (Architecture Decision Record).** A numbered record of a design decision and why it was made.
Read: [ADR-0018, connectors outside core](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/adr/ADR-0018-Connectors-Outside-Core.md), and the other files in [docs/internal/adr/](https://github.com/pavancharak/parmana-core/tree/main/docs/internal/adr).

**RFC.** A proposal document. Example: [RFC-0023, business validation](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0023-Business-Validation.md).

---

## B. Policies, signals and approvals

**Policy.** A versioned set of rules. It names the capabilities it allows, the signals it needs, and the approvals it requires. It is the only thing that decides an action.
Read: [PolicyValidator](https://github.com/pavancharak/parmana-core/tree/main/packages/policy/src) (the validation rules) and [policy-in-effect route](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/routes/policy-in-effect.ts).

**Policy version.** A specific, numbered policy. Only an approved version is live. An older approved version is refused for every policy, and approving an older version again is how to roll back (claim 2.44).

**Rule.** One condition inside a policy, with an outcome such as approve or reject. Rules are evaluated in order.

**Signal.** A fact a policy checks, such as `paymentRefundable` or `managerApproved`.

**Caller-declared signal.** A fact the caller states. Such a fact is trusted only where the policy has an independent check for it. Most signals are caller-declared, which is open gap G-51 (issue #368).
Read: [CLAIMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md) (search for "caller-declared").

**Signal source.** An outside system that establishes a fact for a policy. Registered through maker-checker.
Read: [business-signal-sources route](https://github.com/pavancharak/parmana-core/tree/main/packages/api/src/routes) and [claim 2.54](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md).

**Razorpay payment source.** The read-only source that establishes `payment.refundable`. It is on the feature branch, not on `main`: [razorpay-payment-source.ts](https://github.com/pavancharak/parmana-core/blob/feat/razorpay-payment-signal/packages/runtime/src/business-validation/razorpay-payment-source.ts).

**Approval.** A signed human decision that covers one action, one target, and one amount. Used once.
Read: [ApprovalSignalVerifier.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/approval/src/ApprovalSignalVerifier.ts) and [claim 2.42](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md).

**Approver (approval issuer).** A trusted human whose key can sign approvals. Only listed approvers can sign.
Read: [approval-issuers route](https://github.com/pavancharak/parmana-core/tree/main/packages/api/src/routes) and [claim 2.42](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md).

**Signed approval guard.** The check that refuses an approval artifact that is malformed or unsigned.
Read: [SignedApprovalGuard.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/approval/src/SignedApprovalGuard.ts).

**Injected instruction (prompt injection).** Text that an agent reads and that tries to make it act against its policy. Parmana limits the effect: the agent cannot approve its own request.
Read: [claim 2.44](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md) and [the injected-approval tests](https://github.com/pavancharak/parmana-core/blob/main/packages/approval/tests/unit/injected-instruction-cannot-approve.test.ts).

---

## C. Governance: maker, checker, step-up

**Maker.** The human who proposes a change to a policy, capability, source, or grant.

**Checker.** The human who approves or rejects a proposed change. A checker must be listed for that policy.
Read: [policyChangeCheckers.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/governance/policyChangeCheckers.ts) (`POLICY_CHANGE_CHECKERS`).

**Maker-checker.** The rule that the maker and the checker are different people. The approve route refuses a checker who is also the maker.
Read: [pending-policy-changes.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/routes/pending-policy-changes.ts).

**Pending change.** A proposed change waiting for a checker. Nothing changes until it is approved.

**Step-up.** A short signature a checker makes with their own step-up key at the moment of approval. Valid for at most 120 seconds, and single-use.
Read: [PolicyChangeStepUpVerifier.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/auth/PolicyChangeStepUpVerifier.ts).

**Approval record.** A signed record written when a policy change is approved.
Read: [PolicyChangeApprovalService.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/governance/PolicyChangeApprovalService.ts).

**Governance script.** The command-line helper for proposing and approving changes.
Read: [examples/live-checks/governance.ts](https://github.com/pavancharak/parmana-core/blob/main/examples/live-checks/governance.ts).

---

## D. Capabilities, connectors and grants

**Capability.** A named action an agent may request, such as `razorpay:refund`. Bound to an endpoint, a policy, and allowed parameters.
Read: [external-connectors route](https://github.com/pavancharak/parmana-core/tree/main/packages/api/src/routes) and [ADR-0013](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/adr/ADR-0013-Generic-External-Connector.md).

**Connector.** The service that performs an action in a business system, with its own credential. Lives outside core.
Read: [connectors README](https://github.com/pavancharak/parmana-connectors/blob/main/README.md) and [ADR-0018](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/adr/ADR-0018-Connectors-Outside-Core.md).

**Audience.** The connector's own URL, written into every release. A connector refuses a release addressed to a different URL.
Read: [connectors README, "Release checks"](https://github.com/pavancharak/parmana-connectors/blob/main/README.md).

**Replay protection / release ledger.** The record that stops the same release from acting twice. Stored in Postgres when more than one instance runs.
Read: [connectors README, "What the service checks"](https://github.com/pavancharak/parmana-connectors/blob/main/README.md) and [RUNBOOK.md](https://github.com/pavancharak/parmana-connectors/blob/main/RUNBOOK.md).

**Grant (authority grant).** Permission for one caller to use one capability, up to a per-request limit, until an expiry.
Read: [authority-grants route](https://github.com/pavancharak/parmana-core/tree/main/packages/api/src/routes) and [claim 2.55](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md).

**Per-request limit.** A grant's cap applies to each request. A running total is not enforced (open gap G-93, issue #366).

**Caller.** An application or agent that calls Parmana, identified by its API key.
Read: [generate-api-key.ts](https://github.com/pavancharak/parmana-core/blob/main/scripts/generate-api-key.ts) and [CURRENT-STATE.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/project/CURRENT-STATE.md) (caller API key revocation).

---

## E. Safety controls

**Kill switch.** An operator control that stops new requests. A trip refuses requests that arrive after it. It does not recall an action already past the guard.
Read: [KillSwitchService.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/killSwitch/KillSwitchService.ts), [killSwitchReleaseHook.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/killSwitch/killSwitchReleaseHook.ts), and [KILL-SWITCH-OPERATIONS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/KILL-SWITCH-OPERATIONS.md).

**Two-person reset.** A kill switch reset needs two different operators in production (`KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR=true`).

**Probe.** A scheduled check that sends a request while the kill switch is in place and records what happened.

**Alert.** A message sent for each decision and each kill switch trip, to the URL in `ALERT_WEBHOOK_URL`. Best effort, with no queue.
Read: [AlertSink.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/runtime/src/alerts/AlertSink.ts) and [ALERTS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/ALERTS.md).

**Incident export.** A complete export of signed records for a time window, with offline verification steps.
Read: [INCIDENT-EXPORT.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/INCIDENT-EXPORT.md) and [trust-record-window-export.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/runtime/src/services/trust-record-window-export.ts).

**Audit chain.** Each caller's audit rows linked by hashes, so an edit or deletion is detectable. Deleting the newest row needs an external anchor.
Read: [CallerAuditChainVerifier.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/crypto/src/CallerAuditChainVerifier.ts).

---

## F. Cryptography and keys

**Ed25519.** The default signature algorithm. Used for releases, approvals, and records.

**ML-DSA-65 (Dilithium3).** A post-quantum signature algorithm. Used for hybrid signing. Needs Node 24 with OpenSSL 3.5 or newer.
Read: [CURRENT-STATE.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/project/CURRENT-STATE.md) ("What's real and working").

**Hybrid signing.** Each record carries both an Ed25519 and an ML-DSA-65 signature. Schema version 3 covers the whole record.
Read: [ExecutionTrustRecordCanonicalView.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/crypto/src/ExecutionTrustRecordCanonicalView.ts) and [OPEN-ITEMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/OPEN-ITEMS.md).

**Schema version.** The record format version. Version 2 is in production. Version 3 needs verifiers to be updated first (issue #291, gap G-121).

**Key ceremony.** The documented procedure for creating and recording operator keys.
Read: [OPEN-ITEMS.md, "Key-list ceremony"](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/OPEN-ITEMS.md).

**KMS.** A key management service that holds signing keys outside the application.
Read: [verify-kms-signing.ts](https://github.com/pavancharak/parmana-core/blob/main/scripts/verify-kms-signing.ts) (checks the setup).

**PARMANA_KEY_DIR.** The directory the server reads its key files from.

**Paise.** The smallest unit of a rupee. 100 paise is ₹1. All amounts in Razorpay code are in paise.

---

## G. Razorpay

**Test mode.** Razorpay's sandbox. Keys start with `rzp_test_`. No real money moves.

**Live mode.** Real money. Keys start with `rzp_live_`. Parmana refuses live keys unless explicitly allowed (`PARMANA_ALLOW_LIVE_KEYS=true`).

**Payment id.** Starts with `pay_`, followed by letters and digits.

**Captured.** A payment that Razorpay has taken the money for. Only a captured payment can be refunded.

**Refund.** Returns some or all of a captured payment to the payer. A payment can have several refunds.

**Receipt.** A reference a merchant attaches to a refund. This codebase uses Parmana's `businessTransactionId` as the receipt, so a repeated release finds the refund it already made.
Read: [razorpay-connector.ts](https://github.com/pavancharak/parmana-connectors/blob/main/src/connectors/razorpay/razorpay-connector.ts) and [its README](https://github.com/pavancharak/parmana-connectors/blob/main/src/connectors/razorpay/README.md).

**Refund connector.** The connector that refunds a payment once, even when resent. Lives in connectors.
Read: [src/connectors/razorpay/README.md](https://github.com/pavancharak/parmana-connectors/blob/main/src/connectors/razorpay/README.md).

**Test-mode run.** A script that checks the Razorpay connector against Razorpay's test API.
Read: [test-run.mjs](https://github.com/pavancharak/parmana-connectors/blob/main/src/connectors/razorpay/test-run.mjs).

**Draft policy (razorpay-refund 1.0.0 and 1.1.0).** Drafts on the feature branch. Not active until approved through maker-checker.
Read: [1.0.0 policy.json on the feature branch](https://github.com/pavancharak/parmana-core/blob/feat/razorpay-payment-signal/policies/razorpay-refund/1.0.0/policy.json) and [1.1.0](https://github.com/pavancharak/parmana-core/blob/feat/razorpay-payment-signal/policies/razorpay-refund/1.1.0/policy.json).

---

## H. Development and operations

**Pre-commit hook.** A check that runs before each commit: a secret scan (gitleaks or Docker), then the full verification. Installed by `npm ci`.
Read: [scripts/git-hooks/pre-commit](https://github.com/pavancharak/parmana-core/blob/main/scripts/git-hooks/pre-commit) and [CONTRIBUTING.md](https://github.com/pavancharak/parmana-core/blob/main/CONTRIBUTING.md).

**DCO (Developer Certificate of Origin).** Every commit needs a `Signed-off-by` line, added with `git commit -s`.
Read: [CONTRIBUTING.md, "Commit requirements"](https://github.com/pavancharak/parmana-core/blob/main/CONTRIBUTING.md).

**Signed commits (GPG).** `main` accepts only commits signed with GPG.
Read: [SIGNING-COMMITS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/SIGNING-COMMITS.md).

**Node 24.** The Node version both repositories require.
Read: [NODE-VERSION.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/NODE-VERSION.md).

**`npm ci`.** Installs the exact versions in the lockfile, and runs the `prepare` script that sets up the git hooks.

**`dist/`.** The compiled output. Tests and other packages read it, so it must be rebuilt after source changes.

**Doctor.** A script that checks the local or production configuration.
Read: [scripts/doctor.ts](https://github.com/pavancharak/parmana-core/blob/main/scripts/doctor.ts).

**OpenAPI.** The machine-readable description of the HTTP API.
Read: [openapi/openapi.yaml](https://github.com/pavancharak/parmana-core/blob/main/openapi/openapi.yaml).

**Vercel.** The hosting platform for the production API and the connector service.
Read: [PRODUCTION-DEPLOY-AND-ROLLBACK.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/PRODUCTION-DEPLOY-AND-ROLLBACK.md).

**Redeploy.** Applies new environment values to the current build. A fresh build does not apply them.

**Environment variable.** A setting read at startup. Full list, with defaults: [environment-variables.mdx](https://github.com/pavancharak/parmana-core/blob/main/docs/site/deployment/environment-variables.mdx) for core, and the table in [connectors README](https://github.com/pavancharak/parmana-connectors/blob/main/README.md) for connectors.

**Stale build.** Output older than the source. The test suite refuses to run against it. Fix: `npm run build`.

**Replay.** Sending the same request again. Parmana acts at most once per release.

---

## I. Where to look when stuck

| Problem                       | Start here                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A command fails               | The developer guide sent earlier (its troubleshooting table, section 9). Also [CONTRIBUTING.md](https://github.com/pavancharak/parmana-core/blob/main/CONTRIBUTING.md)                                                                                                                      |
| A change is refused           | [pending-policy-changes.ts](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/routes/pending-policy-changes.ts) for approval refusals, and [connectors README, "Errors"](https://github.com/pavancharak/parmana-connectors/blob/main/README.md) for connector refusals |
| A connector failed            | [connectors RUNBOOK.md](https://github.com/pavancharak/parmana-connectors/blob/main/RUNBOOK.md), "Recovering a release that was recorded but not confirmed"                                                                                                                                 |
| Production deploy             | [PRODUCTION-DEPLOY-AND-ROLLBACK.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/PRODUCTION-DEPLOY-AND-ROLLBACK.md)                                                                                                                                         |
| Whether a feature is built    | [CURRENT-STATE.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/project/CURRENT-STATE.md)                                                                                                                                                                            |
| Whether a claim is true       | [CLAIMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md), then its evidence                                                                                                                                                                               |
| What is still open            | [VERIFICATION-GAPS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md) and [OPEN-ITEMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/OPEN-ITEMS.md)                                                                     |
| Why a decision was made       | [DECISIONS.md](https://github.com/pavancharak/parmana-core/blob/main/DECISIONS.md) and [docs/internal/adr/](https://github.com/pavancharak/parmana-core/tree/main/docs/internal/adr)                                                                                                        |
| A setting is missing or wrong | [environment-variables.mdx](https://github.com/pavancharak/parmana-core/blob/main/docs/site/deployment/environment-variables.mdx), or `npm run doctor`                                                                                                                                      |
| An incident needs records     | [INCIDENT-EXPORT.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/INCIDENT-EXPORT.md)                                                                                                                                                                       |
| Security concern              | [SECURITY.md](https://github.com/pavancharak/parmana-core/blob/main/SECURITY.md). Report privately, not as a public issue                                                                                                                                                                   |
