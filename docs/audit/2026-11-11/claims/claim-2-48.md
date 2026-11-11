# 2.48 The Server Tells an Agent What a Request Must Carry (Scoped, 2026-09-30)

Source: CLAIMS.md (commit d1d63c6), lines 623-644.

## Exact claim text

## 2.48 The Server Tells an Agent What a Request Must Carry (Scoped, 2026-09-30)

**Claim:** `GET /policies/in-effect?capability=...` returns, with the policy to declare, what a request under it must carry: every fact the policy's rules read, their declared types, the signals that must equal a value of the Intent, and the signals that need a signed approval with where the approval's resource and amount are in the request. An agent can build a request from the server's answer, without a copy of the policy and without asking the operator.

Scope, stated plainly:

- **Rule conditions are not returned.** The answer carries the policy's `description`, the author's own text, which may mention a limit; the server decides with the rules.
- **Same authorization as before.** Only a caller whose key may invoke the capability, or a human caller.
- **Fails closed.** If the policy in effect cannot be read, the answer is `503 POLICY_VERSION_UNAVAILABLE`, never a partial answer.
- **SDKs:** `policyInEffect()` in TypeScript and `policy_in_effect()` in Python are in the repository, not yet published (1.4.0 on the registries does not have them). **Update:** published in SDK 1.5.0 (2026-10-04).
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/policy/tests/unit/policySignalRequirements.test.ts`: facts collected from nested `all` and `any`, sorted, once; empty objects when a policy declares none.
- `typescript/test/Alignment.test.ts`, `python/tests/test_sdk_alignment.py`: the SDK methods call the endpoint and return the answer; Python keeps signal names unconverted.

Evidence

- `packages/api/src/routes/policy-in-effect.ts`; `packages/policy/src/policySignalRequirements.ts` (also used by `PolicyValidator`)
- `openapi/openapi.yaml` (`getPolicyInEffect`); `docs/site/agents/integrate.mdx` step 3


## Cited evidence paths

- `docs/site/agents/integrate.mdx`: EXISTS
- `openapi/openapi.yaml`: EXISTS
- `packages/api/src/routes/policy-in-effect.ts`: EXISTS
- `packages/policy/src/policySignalRequirements.ts`: EXISTS
- `packages/policy/tests/unit/policySignalRequirements.test.ts`: EXISTS
- `python/tests/test_sdk_alignment.py`: EXISTS
- `typescript/test/Alignment.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/policy/tests/unit/policySignalRequirements.test.ts` | passed | 3 | 3 | 0 |
| `python/tests/test_sdk_alignment.py` | not-run-or-missing | 0 | 0 | 0 |
| `typescript/test/Alignment.test.ts` | passed | 17 | 17 | 0 |
