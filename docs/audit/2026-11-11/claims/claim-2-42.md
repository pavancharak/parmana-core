# 2.42 A Signed Human Approval Is Required Where a Policy Declares It

Source: CLAIMS.md (commit d1d63c6), lines 1418-1456.

## Exact claim text

## 2.42 A Signed Human Approval Is Required Where a Policy Declares It

**Update (2026-11-05, G-149).** At release, the execution gateway refuses an authorization that has no `signalsHash` when the signal state verifier is configured. Before this change such an authorization skipped the release-time signal check and counted as a pass. Only authorizations issued before the hash was added are refused.

**Claim.** A policy can require a signed approval from a trusted approver before an action runs. Such an approval is for one order or resource, covers one amount, and is used once. A request whose declared facts say an approval was given, but with no signed approval behind that statement, is refused at any amount.

**How it works.**

- A policy lists the facts that need a signed approval, in `approvalSignals`, with dot paths to the resource (or the Intent's `target`) and, optionally, the value in the Intent. No code is needed per action.
- `ApprovalSignalVerifier` enforces every declaration. It runs when the policy would approve, before the authorization is signed, and again in the Execution Gateway just before release. At release it checks the policy the gateway loaded and hash-checked.
- It checks that the approver is trusted and not revoked, the Ed25519 signature, the expiry, the action, the resource, and the value. The value is read from the Intent, never from the caller's declared facts. It checks every approval before it uses any, and it uses each approval once.
- An approval's `scope.field` must be `value` when the declaration gives a value path, and `resourceId` otherwise. An approval signed with another field name is refused.
- `PolicyValidator` rejects a declaration that no rule reads, a resource path other than `target` or a path into the Intent's parameters, a declared key that is also bound, and two declarations that share an approval.
- Approvers sign on their own machine, with `scripts/sign-approval.ts`, using a key made by `scripts/generate-approver-key.ts`. Approver keys are Ed25519, whatever signing algorithm the server uses.

**Refunds.** The refund policy, `customer-refund`, now requires a signed approval for every refund (1.2.0, see 2.44). Earlier versions used amount tiers. Under the earlier tiers, a refund above 10000 needed a signed approval, and a refund above 100000 was refused.

**Scope and limits.**

- **The approver list is short.** Only the approvers in `TRUSTED_APPROVAL_ISSUERS` can sign, and an approval from anyone else is refused (2.45).
- **A refused request is not held for a person, and nobody is notified.** The agent sends a new request with the approval. Notification is covered by 2.46.
- **Caller-declared facts cannot approve.** Facts such as `refundEligible` and `fraudCheckPassed` can refuse a refund but cannot authorize one (G-51, and 2.44).
- **The agent path is new.** The refund agent forwards a signed approval, in the `approvalArtifact` field of its request. That path has not been run in production.

**Evidence.**

- `packages/approval/src/ApprovalSignalVerifier.ts`
- `packages/policy/src/types/Policy.ts` (`approvalSignals`) and `packages/policy/src/PolicyValidator.ts`
- `packages/execution-gateway/src/ExecutionGateway.ts` (passes the verified policy at release)
- `packages/crypto/src/ApprovalArtifactCrypto.ts`
- `scripts/generate-approver-key.ts` and `scripts/sign-approval.ts`
- `docs/site/concepts/human-approval.mdx`
- `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts`
- `packages/policy/tests/unit/PolicyValidator-approvalSignals.test.ts`
- `packages/crypto/tests/unit/approval-artifact-signer.test.ts`
- `packages/approval/tests/unit/ApprovalVerifier.test.ts`

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `docs/site/concepts/human-approval.mdx`: EXISTS
- `packages/approval/src/ApprovalSignalVerifier.ts`: EXISTS
- `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts`: EXISTS
- `packages/approval/tests/unit/ApprovalVerifier.test.ts`: EXISTS
- `packages/crypto/src/ApprovalArtifactCrypto.ts`: EXISTS
- `packages/crypto/tests/unit/approval-artifact-signer.test.ts`: EXISTS
- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/policy/src/PolicyValidator.ts`: EXISTS
- `packages/policy/src/types/Policy.ts`: EXISTS
- `packages/policy/tests/unit/PolicyValidator-approvalSignals.test.ts`: EXISTS
- `scripts/generate-approver-key.ts`: EXISTS
- `scripts/sign-approval.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                            | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts`        | passed | 34    | 34     | 0       |
| `packages/approval/tests/unit/ApprovalVerifier.test.ts`              | passed | 22    | 22     | 0       |
| `packages/crypto/tests/unit/approval-artifact-signer.test.ts`        | passed | 6     | 6      | 0       |
| `packages/policy/tests/unit/PolicyValidator-approvalSignals.test.ts` | passed | 14    | 14     | 0       |
