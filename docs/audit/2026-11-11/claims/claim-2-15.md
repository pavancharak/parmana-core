# 2.15 Authorization-Binding Verification

Source: CLAIMS.md (commit d1d63c6), lines 331-346.

## Exact claim text

## 2.15 Authorization-Binding Verification

Every APPROVED execution in a verified Execution Trust Record must carry a non-empty authorizationId in its metadata; absence fails verification and names the execution. REJECTED-decision executions are not required to carry one. All checks (integrity, signature, authorization binding) run unconditionally and independently: a single failure never suppresses reporting of the others.

Evidence

- VerificationService (packages/runtime/src/services/verification-service.ts)

- packages/runtime/tests/unit/verification-service.test.ts: all 8 cases

- packages/runtime/tests/unit/verification-negative.test.ts: always-running, in-memory: fails on a mutated transaction payload field, a mutated signature value, and a mutated executions hash-chain-array element

- packages/api/tests/integration/verification-negative.integration.test.ts: "reports FAILED when the persisted record is tampered after execution" (additional citation; Supabase-gated, does not run without live credentials)

---

## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
