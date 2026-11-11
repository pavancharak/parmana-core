# 3.28 Three Evaluation Questions Checked Against the Source (Scoped, 2026-10-26)

Source: CLAIMS.md (commit d1d63c6), lines 2085-2100.

## Exact claim text

## 3.28 Three Evaluation Questions Checked Against the Source (Scoped, 2026-10-26)

**Claim.** When a policy rejects a transaction, no connector is called. The envelope verifier does not accept a record whose authorization is missing, expired, or reused. Signal types are checked against the policy's declared schema before any rule runs.

**Evidence.**

- Envelope verifier: `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts` and `envelope-verifier.dilithium3.test.ts`. They check `notExpired` and `nonceUnseen`, and "rejects a second use of the same nonce". Run on 2026-10-26: 22 pass, 5 skipped.
- Signal types: `packages/policy/src/PolicyEngine.ts`, `evaluate`, calls `findSignalTypeViolations` (line 42) before the rule loop (line 93). The check is in `packages/policy/src/signalTypes.ts`, with `packages/policy/tests/unit/signalTypes.test.ts`. Run on 2026-10-26: 21 pass.

**Limits.**

- The envelope verifier checks the record it is given. Refusing a release is the execution gateway's job, and this section does not claim the gateway's behavior.
- The five skipped envelope tests need ML-DSA-65, which needs Node 24. The run used Node 22.22.0, so the post-quantum path is not checked by this run.
- The signal-type check covers only signals the schema declares. A signal absent from the payload is not a type violation, and the rules decide it. This is the design, not a gap in the check.
- The 2026-10-26 runs needed local builds of the workspace packages and a rebuilt `re2` native module. Nothing was committed for them.


## Cited evidence paths

- `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts`: EXISTS
- `packages/policy/src/PolicyEngine.ts`: EXISTS
- `packages/policy/src/signalTypes.ts`: EXISTS
- `packages/policy/tests/unit/signalTypes.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts` | passed | 22 | 22 | 0 |
| `packages/policy/tests/unit/signalTypes.test.ts` | passed | 21 | 21 | 0 |
