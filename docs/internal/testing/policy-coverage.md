# Policy coverage: what the tests prove about production

Production runs one policy: `policies/payment-refund/1.0.0/policy.json`. Every other policy is retired and lives under `fixtures/policies/`. The architecture test `tests/architecture/live-policies-only-in-use.test.ts` enforces this.

## What covers production

- `packages/policy/tests/unit/LivePaymentRefundPolicy.test.ts`: loads the live file and checks its three rules (refuse when not refundable, approve with a signed manager approval, reject by default).

## What does not cover production

The files below read retired policies from `fixtures/policies/`. They prove the engine and the runtime, not what production decides. They are listed so no one reads them as production coverage.

- `examples/archive/32-runtime-pipeline/run.ts`
- `examples/scenarios/expense-approval/run.ts`
- `examples/scenarios/purchase-order/run.ts`
- `examples/shared/helpers/demo-approval.ts`
- `examples/tutorials/03-runtime-execution/run.ts`
- `examples/tutorials/04-policy-router/run.ts`
- `examples/tutorials/05-verification/run.ts`
- `examples/tutorials/06-replay/run.ts`
- `examples/tutorials/07-receipt-generation/run.ts`
- `examples/tutorials/10-end-to-end/run.ts`
- `examples/tutorials/100-authorization-caller-type-agnostic/run.ts`
- `examples/tutorials/102-distinguishable-http-status/run.ts`
- `examples/tutorials/105-tenant-key-isolation/run.ts`
- `examples/tutorials/106-api-key-issuance/README.md`
- `examples/tutorials/106-api-key-issuance/run.ts`
- `examples/tutorials/11-execution-authorization/run.ts`
- `examples/tutorials/12-envelope-verification/run.ts`
- `examples/tutorials/128-nbfc-loan-disbursement/run.ts`
- `examples/tutorials/13-post-quantum-signatures/run.ts`
- `examples/tutorials/15-custom-runtime-component/run.ts`
- `examples/tutorials/16-runtime-pipeline/run.ts`
- `examples/tutorials/17-multi-policy-routing/run.ts`
- `examples/tutorials/18-runtime-hooks/run.ts`
- `examples/tutorials/19-runtime-composition/README.md`
- `examples/tutorials/19-runtime-composition/run.ts`
- `examples/tutorials/20-batch-execution/README.md`
- `examples/tutorials/20-batch-execution/run.ts`
- `examples/tutorials/21-partial-failure-handling/README.md`
- `examples/tutorials/21-partial-failure-handling/run.ts`
- `examples/tutorials/22-idempotent-execution/README.md`
- `examples/tutorials/22-idempotent-execution/run.ts`
- `examples/tutorials/23-production-deployment/README.md`
- `examples/tutorials/23-production-deployment/run.ts`
- `examples/tutorials/24-sdk-integration-patterns/run.ts`
- `examples/tutorials/25-execution-permit-generation/README.md`
- `examples/tutorials/25-execution-permit-generation/run.ts`
- `examples/tutorials/26-execution-authorization-verification/README.md`
- `examples/tutorials/26-execution-authorization-verification/run.ts`
- `examples/tutorials/27-authorization-expiration/run.ts`
- `examples/tutorials/28-envelope-replay-detection/README.md`
- `examples/tutorials/28-envelope-replay-detection/run.ts`
- `examples/tutorials/29-authorization-tampering/run.ts`
- `examples/tutorials/30-policy-version-pinning/run.ts`
- `examples/tutorials/31-authorization-binding/run.ts`
- `examples/tutorials/32-execution-pipeline/README.md`
- `examples/tutorials/32-execution-pipeline/run.ts`
- `examples/tutorials/33-execution-boundary/run.ts`
- `examples/tutorials/34-execution-gateway/run.ts`
- `examples/tutorials/35-replay-attack/run.ts`
- `examples/tutorials/36-parameter-tampering/run.ts`
- `examples/tutorials/37-action-substitution/run.ts`
- `examples/tutorials/38-target-substitution/run.ts`
- `examples/tutorials/39-policy-substitution/run.ts`
- `examples/tutorials/40-signature-forgery/run.ts`
- `examples/tutorials/41-expired-authorization/run.ts`
- `examples/tutorials/42-nonce-reuse/run.ts`
- `examples/tutorials/43-stolen-authorization/run.ts`
- `examples/tutorials/44-direct-api-bypass/run.ts`
- `examples/tutorials/45-connector-bypass/run.ts`
- `examples/tutorials/46-toctou-protection/run.ts`
- `examples/tutorials/53-execution-permit/run.ts`
- `examples/tutorials/54-execution-receipt/run.ts`
- `examples/tutorials/55-execution-receipt-verification/run.ts`
- `examples/tutorials/56-complete-execution-flow/run.ts`
- `examples/tutorials/62-signal-intent-binding/README.md`
- `examples/tutorials/62-signal-intent-binding/run.ts`
- `examples/tutorials/77-caller-ownership-scoping/run.ts`
- `examples/tutorials/98-signal-freshness-enforcement/run.ts`
- `packages/api/tests/integration/caller-auth.integration.test.ts`
- `packages/api/tests/integration/execution-intents.integration.test.ts`
- `packages/api/tests/integration/fault-injection.integration.test.ts`
- `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`
- `packages/api/tests/unit/workflow-api.test.ts`
- `packages/connector-sdk/tests/unit/reference-policy.test.ts`
- `packages/policy/tests/unit/CustomerRefundPolicy120.test.ts`
- `packages/policy/tests/unit/LoanDisbursement.test.ts`
- `packages/policy/tests/unit/ReferencePolicies.test.ts`
- `packages/policy/tests/unit/ReferencePoliciesDeterminism.test.ts`
- `packages/policy/tests/unit/ReferencePoliciesEvaluation.test.ts`
- `packages/policy/tests/unit/ReferencePoliciesNegativeEvaluation.test.ts`
- `packages/policy/tests/unit/file-policy-repository.test.ts`
- `packages/runtime/tests/e2e/runtime.e2e.test.ts`
- `packages/runtime/tests/integration/approval-race.integration.test.ts`
- `packages/runtime/tests/integration/kill-switch-release.integration.test.ts`
- `packages/runtime/tests/integration/runtime.integration.test.ts`
- `packages/runtime/tests/unit/execution-intent.test.ts`
- `packages/runtime/tests/unit/execution-record-incomplete.test.ts`
- `scripts/drills/outage-drill.sh`
- `scripts/load-test.ts`
- `scripts/run-examples.ts`
- `tests/architecture/live-policies-only-in-use.test.ts`
- `typescript/test/integration/examples.integration.test.ts`
- `typescript/test/integration/parmana-client.integration.test.ts`
