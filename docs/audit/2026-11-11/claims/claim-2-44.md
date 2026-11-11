# 2.44 An Agent Cannot Authorize an Action by Declaring Facts

Source: CLAIMS.md (commit d1d63c6), lines 1487-1521.

## Exact claim text

## 2.44 An Agent Cannot Authorize an Action by Declaring Facts

**Claim.** An AI agent can be manipulated by content it reads (prompt injection). For the actions below, the agent cannot authorize its own request by declaring facts. Each write needs a signed approval from a trusted person for that specific action, and the facts the agent declares can refuse a request but cannot approve it.

**Per action.**

- **LLM tool call (`llm-tool-call`).** `llm-tool-call` 1.1.0 approves only when `humanApproval` is true. That fact needs a signed approval for the specific tool.

Every approve rule in these policies requires an approval-backed fact to be true. A test checks the structure, not only examples: with every caller-declared fact at its most permissive value and no approval, each request is refused.

**Refusal reasons.** Refusal reasons stay specific. The policy files are public, and a caller can read its own Refusal Record, so hiding the reasons would not help. `connector-policies-not-self-authorizing.test.ts` requires that, for every bound capability that changes state, every approve rule needs an approval-backed fact on every path. A new capability fails that test until it is classified as a read or a write.

**Scope and limits.**

- **Every refund needs a person.** This is a product change: refunds up to the limit no longer run without a manager. Automatic refunds return only with an independent eligibility and fraud check that the server itself reads (a `SignalStateVerifier`). That check does not exist yet.
- **Any trusted approver can sign for any action.** Approvers are not limited per action (G-50). The approver list is short (2.42).
- **Versions are pinned.** Production runs the policy version most recently approved through maker checker (2.43). A superseded version is refused for every policy, before authorization and at release. This also means an older approved version cannot be named to get weaker rules. Approving an older version again rolls back (G-74).
- **No connector runs an LLM tool call.** On the hosted API, an approved `llm-tool-call` decision executes nothing.
- **Connector configuration is outside this claim.** Whether a given deployment has a connector configured does not change the rules above.

- **Injected content still reaches the agent.** Parmana does not stop the agent from reading injected instructions, so an agent can still ask for the wrong write. The claim is that the write cannot be approved without a human signature, not that the request is never made. An approval that is forged, widened after signing, redirected to another order, or replayed is refused. Tested in `packages/approval/tests/unit/injected-instruction-cannot-approve.test.ts` (G-141, issue #433). Refused requests are recorded and signed.

**Evidence.**

- `packages/approval/tests/unit/injected-instruction-cannot-approve.test.ts`
- `policies/customer-refund/1.2.0/policy.json`
- `policies/llm-tool-call/1.1.0/policy.json`
- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (the bindings for these capabilities)
- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`
- `packages/policy/tests/unit/CustomerRefundPolicy120.test.ts`
- `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`
- `examples/tutorials/119-human-approval-for-one-action`

Dated updates and the production approval history for these policies are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md). The text this section had before this rewrite is in the git history of `main`.

## Cited evidence paths

- `examples/tutorials/119-human-approval-for-one-action`: EXISTS
- `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`: EXISTS
- `packages/approval/tests/unit/injected-instruction-cannot-approve.test.ts`: EXISTS
- `packages/capability-registry/src/CapabilityPolicyBinding.ts`: EXISTS
- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`: EXISTS
- `packages/policy/tests/unit/CustomerRefundPolicy120.test.ts`: EXISTS
- `policies/customer-refund/1.2.0/policy.json`: EXISTS
- `policies/llm-tool-call/1.1.0/policy.json`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                  | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`  | passed | 1     | 1      | 0       |
| `packages/approval/tests/unit/injected-instruction-cannot-approve.test.ts` | passed | 6     | 6      | 0       |
| `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`                | passed | 84    | 84     | 0       |
| `packages/policy/tests/unit/CustomerRefundPolicy120.test.ts`               | passed | 11    | 11     | 0       |
