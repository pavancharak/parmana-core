# 2.5 Verifiable Execution Evidence

Source: CLAIMS.md (commit d1d63c6), lines 142-194.

## Exact claim text

## 2.5 Verifiable Execution Evidence

Parmana generates cryptographically verifiable execution evidence.

Execution produces:

- Execution Trust Records

- Canonical Trust Record hashes

- Signed Receipts

Evidence

- BusinessTrustRecordBuilder (renamed from ExecutionTrustRecordBuilder)

- ExecutionComponent, ExecutionEvidenceBuilder (packages/runtime/src/{components/ExecutionComponent,ExecutionEvidenceBuilder}.ts) — the live pipeline stage that builds and attaches ExecutionEvidence to every Execution, called by RuntimeFactory-constructed Runtimes; not to be confused with ExecutionEvidenceComponent, a same-named-in-spirit stub confirmed unwired and deleted (docs/internal/VERIFICATION-GAPS.md G-26)

- ReceiptService (packages/runtime/src/services/receipt-service.ts), called directly by ExecutionTrustApplication.execute() on every successful execution

- VerificationCrypto

- ReceiptCrypto

- packages/runtime/tests/integration/receipt.integration.test.ts, receipt-hybrid.integration.test.ts

**Structured decision trace (2026-09-15, docs/internal/VERIFICATION-GAPS.md G-44).** The signed
evidence above now records _how_ a decision was reached, not only _that_ it was and _why_ as
free text. `PolicyEngine.evaluate()` computes `matchedRuleId`, `evaluatedRules`, and
`matchedPath` (the complete ordered rule-id trace) as part of its `PolicyDecision`
(packages/policy/src/PolicyEngine.ts); `DecisionBuilder.build()`
(packages/runtime/src/DecisionBuilder.ts) now carries all three through, verbatim, into the
`Decision` that actually gets signed and persisted (packages/shared/src/domain/decision.ts) —
previously it carried forward only `outcome` and `reason`, dropping the structured trace
before it reached any durable artifact. Optional fields, same pattern as
`PolicyReference.contentHash` (G-24): absent only on a `Decision` built before this field
existed, never a breaking change. Mirrored into the TypeScript SDK model, the JSON schema, and
the generated Python SDK model. Found and fixed same day by an independent read-only audit,
(the 2026-09-15 evidence anchor audit, GAP-2; in git history); verified via
packages/runtime/tests/unit/DecisionBuilder.test.ts and a real live execution against a
locally-running instance (see docs/internal/VERIFICATION-GAPS.md G-44).

**Vendor-confirmation visibility (2026-09-15, docs/internal/VERIFICATION-GAPS.md G-46).**
`ConnectorEvidence` (packages/execution-gateway/src/connector-execution/ConnectorEvidence.ts)
gained `vendorConfirmationVerified: boolean`, defaulting to `false` and folded into
`connectorEvidenceHash`. Confirmed by grep before adding it: no connector in this codebase independently verifies a vendor-originated cryptographic confirmation. This makes that architectural limitation
visible in every piece of evidence itself, not only in prose documentation, and gives a future
connector that does add real vendor-signature verification somewhere to record it. Found and
fixed same day by the same audit (GAP-3); verified via
packages/execution-gateway/tests/unit/evidence-hashing.test.ts and a real live execution.

---

## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
