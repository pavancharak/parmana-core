# 2.22 Canonical Capability-to-Policy Binding

Source: CLAIMS.md (commit d1d63c6), lines 524-544.

## Exact claim text

## 2.22 Canonical Capability-to-Policy Binding

**Claim.** Each capability in the canonical table is governed by one policy name, fixed by the table. The caller cannot choose a different policy for it. A request that pairs a bound capability with any other policy is refused as a policy denial, before any rule is evaluated.

**Why it matters.** Policies are loaded by the name and version the request declares. Without the binding, a caller could pair a capability that changes real state with an unrelated policy that does not protect it, and run that capability's parameters under the weaker rules. The binding closes that route.

**Scope.** The table (`CANONICAL_CAPABILITY_POLICY_BINDINGS`) binds no capability in this version, because every built in connector has moved out of core (ADR-0018). The mechanism applies to any capability added to the table later. Reads have their own policy, so that each approval covers only what it reads. The table pins the policy name. Where policy governance is enforced, the version is the one most recently approved for that name (see 2.43).

**Where it runs.** `CapabilityPolicyBinder` is in `packages/capability-registry`. `RuntimeBuilder` constructs it on every build and passes it to the runtime engine, which runs the check before signal binding and policy evaluation.

**Connectors.** Core no longer registers the vendor connectors for these capabilities. They are moving to the `parmana-connectors` repository (ADR-0018, still being migrated). The table stays in core, so a request for one of these capabilities is still checked against its policy name.

Evidence

- `packages/capability-registry/src/CapabilityPolicyBinding.ts`
- `packages/runtime/src/RuntimeBuilder.ts` (the binder is always constructed and passed to the engine)
- `packages/runtime/src/RuntimeEngine.ts` (the binder check runs before signal binding and policy evaluation)
- `packages/capability-registry/tests/unit/` (the binder's tests)

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `packages/capability-registry`: EXISTS
- `packages/capability-registry/src/CapabilityPolicyBinding.ts`: EXISTS
- `packages/capability-registry/tests/unit/`: EXISTS
- `packages/runtime/src/RuntimeBuilder.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                | Status | Tests | Passed | Skipped |
| ------------------------------------------------------------------------ | ------ | ----- | ------ | ------- |
| `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts` | passed | 21    | 21     | 0       |
| `packages/capability-registry/tests/unit/ExternalPolicyBinding.test.ts`  | passed | 7     | 7      | 0       |
