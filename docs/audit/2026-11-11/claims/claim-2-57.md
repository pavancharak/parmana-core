# 2.57 Proof Audit: Five Authorization Properties Tested by Execution (Scoped, 2026-10-16)

Source: CLAIMS.md (commit d1d63c6), lines 797-838.

## Exact claim text

## 2.57 Proof Audit: Five Authorization Properties Tested by Execution (Scoped, 2026-10-16)

**Claim.** Five properties of Parmana's authorization proofs were tested by running the code
paths, not by reading them. The tests are in `proof-audit/tests/` and run with
`npx vitest run proof-audit/tests` after `npm ci` and `npm run build`. Each case writes a
`PASS` or `FAIL` verdict to `proof-audit/results/`.

1. **Third-party verification without Parmana's services, database or private keys: Verified** for the
   Execution Trust Record bundle. A proof verifies in a fresh process with an empty environment, no
   key files and the network denied, both in-process and in an empty network namespace. Nine field
   changes (decision, amount, action ID, timestamps, policy version, both signatures) each fail. Scope:
   the verifier no longer reads a `.env` file on import (G-112).
2. **Execution requires a valid, current proof.** A missing,
   forged, expired, revoked, mismatched or denied-decision proof each reaches the external endpoint zero
   times. A control with an approved decision reaches it once. Not all paths are covered yet (G-115).
3. **A proof authorizes only the parameters it was issued for.**
   A changed amount, target, recipient identifier, connector, operation or validity window is rejected.
   Replay is rejected at the gateway and at the API, each with zero extra endpoint calls.
4. **An old proof verifies against the policy version it cites, and a published version cannot be
   overwritten in place: Verified. The startup governance integrity check is now exercised by the audit
   (Test 4); running it against the live policy directory remains an operator step.** Adding a version leaves old proofs valid. A different-content rewrite is refused
   with `409` and the stored content is unchanged. An identical re-save is allowed (G-106).
5. **Altering or deleting a stored audit record is detectable: Detected** for content edits, middle and
   first deletions, and both reorder forms, in the per-caller chain and the per-authorization execution chain. the newest record is
   detected only when the chain head is anchored outside the database** (G-108).

**What the audit found first.** The first run falsified claim 2 (the gateway released a validly signed
denied decision, and the in-process release path accepted caller-set flags), claim 4 (a published
version could be overwritten) and claim 5 (tail truncation). The fixes and their residuals are recorded in `docs/internal/VERIFICATION-GAPS.md`, G-103 to G-118.
The first-run measurements are not published in this repository.

**Coverage after the follow-up fixes.** The Postgres nonce store runs on PostgreSQL semantics
(Test 6). The startup governance integrity check runs against a signed approval record (Test 4). Not yet
covered: KMS signing, a live external connector endpoint (G-133), and the caller
authorization scoping (the API harness disables caller authentication, as the existing integration tests do).
These are listed as open in `docs/internal/REMAINING-WORK.md` section M.

**Evidence.** `test10-execution-audit.test.ts`; `packages/api/src/bootstrap/createReleaseVerifier.ts`;
`packages/execution-control/src/ExecutionControlService.ts`; `packages/execution-gateway/src/ExecutionGateway.ts`
(`decisionApproved`); `packages/policy/src/FilePolicyRepository.ts` (`save`, `PolicyVersionImmutableError`);
`packages/crypto/src/CallerAuditChainVerifier.ts` (`verifyChain`, the `anchor` argument).


## Cited evidence paths

- `docs/internal/REMAINING-WORK.md`: EXISTS
- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api/src/bootstrap/createReleaseVerifier.ts`: EXISTS
- `packages/crypto/src/CallerAuditChainVerifier.ts`: EXISTS
- `packages/execution-control/src/ExecutionControlService.ts`: EXISTS
- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/policy/src/FilePolicyRepository.ts`: EXISTS
- `proof-audit/results/`: EXISTS
- `proof-audit/tests/`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `proof-audit/tests/` | not-run-or-missing | 0 | 0 | 0 |
