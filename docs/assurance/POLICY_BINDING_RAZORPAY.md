# razorpay:refund and customer-refund: the policy binding gap

**Status:** Gap open. The binding attempted on branch `claude/bind-razorpay-refund` was dropped by owner decision D15 (14 November 2026). Nothing binds `razorpay:refund` to a policy in `parmana-core`.
**Owner:** Pavan Charak

## 1. The gap

The Razorpay connector in `parmana-connectors` runs one capability, `razorpay:refund` (`RAZORPAY_REFUND_CAPABILITY` in `src/connectors/razorpay/razorpay-connector.ts`). Nothing in `parmana-core` ties that capability to the `customer-refund` policy:

1. `razorpay:refund` is a built-in connector namespace. External connector registrations refuse built-in namespaces (`packages/api/src/routes/external-connectors.ts`, ADR-0013), so the link cannot be made through that route.
2. The canonical table `CANONICAL_CAPABILITY_POLICY_BINDINGS` in `packages/capability-registry/src/CapabilityPolicyBinding.ts` is empty.
3. The `customer-refund` policies (1.0.0 to 1.3.0 under `policies/customer-refund/`) have no `capability` field.

Result: a request for `razorpay:refund` can declare any approved policy, including an unrelated one, and the binder does not refuse it.

Note: the audit note `docs/audit/2026-11-11/gaps/G-27.md` names the capability `razorpay:refund-create`. The connector source uses `razorpay:refund`. The audit note is out of date.

## 2. What was attempted

Branch `claude/bind-razorpay-refund` (pull request [#635](https://github.com/pavancharak/parmana-core/pull/635)) added a canonical entry binding `razorpay:refund` to `customer-refund` 1.3.0, with four binder tests and an updated canonical-table test. The owner confirmed version 1.3.0 (D14).

Running the full suite under Node 24.22.2 showed a conflict with the G-77 guard, `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`. Its first assertion requires every bound capability to be in the read set, so any write binding fails it. The per-capability check for `razorpay:refund` passed: the approve rules of `customer-refund` 1.3.0 require a trusted fact. The conflict is in the classification assertion, not in the policy.

## 3. Decision

Owner decision D15 (14 November 2026): keep the strict G-77 assertion and drop the binding. The G-77 guard is not changed. The binding is removed from the canonical table, and its tests are removed.

## 4. State after the revert

- `CANONICAL_CAPABILITY_POLICY_BINDINGS` is empty, as before the attempt.
- `CapabilityPolicyBinder.test.ts` and `CapabilityPolicyBinding.ts` match the base commit `d7082f0c`.
- The binding test file is removed.
- Checks run after the revert, on the revert commit: `npm run typecheck` exit 0; `vitest run packages/capability-registry packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts` (Node 24.22.2) 3 files, 29 tests, all passed.

Not run: the full suite after the revert.

## 5. What is needed to bind it later

The binding can be added again only after the owner decides how G-77 classifies writes. Options for that decision:

1. Change the classification assertion, so that bound writes are checked by the per-capability test. That test already passes for `razorpay:refund`.
2. Keep the strict assertion, and find another way to link the capability, such as a policy field or a connector-level binding.

The version to bind is 1.3.0 (D14). Live traffic: the owner states there is none for `razorpay:refund`.

## 6. Commit and signing

- The commits on the branch are signed off (`Signed-off-by`) but not signed. Git reported that `gpg.ssh.allowedSignersFile` is not configured. The key file `/home/claude/.ssh/commit_signing_key.pub` is empty and no private key is present, so this session cannot sign commits. Signing must be fixed before merge.

## 7. Capability connection (as it stands)

| Field           | Value                                                                        | Where it is defined                                                  |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Capability name | `razorpay:refund`                                                            | `parmana-connectors` `src/connectors/razorpay/razorpay-connector.ts` |
| Intent name     | `customer-refund`. The owner states that the policy name is the intent name. | Owner statement (14 November 2026)                                   |
| Policy name     | `customer-refund`                                                            | `policies/customer-refund/`                                          |
| Policy version  | `1.3.0` (owner confirmed, D14). Latest version in the repo.                  | D14 in `docs/ASSURANCE_DECISIONS.md`                                 |
| Binding in code | **None.** `CANONICAL_CAPABILITY_POLICY_BINDINGS` is empty (D15).             | `packages/capability-registry/src/CapabilityPolicyBinding.ts`        |

Two other places the link could live, both to verify before any binding is designed:

- `docs/guides/production-integration-guide.md` says a capability (for example `razorpay:refund`) is bound to an endpoint and a policy, and is registered through maker-checker. If that registration records the policy, it is a second connection path and was not checked here.
- `docs/audit/2026-11-11/STALE-DOCUMENTS.md` and G-66 cite `paytm:refund` to `customer-refund` as an example of the canonical table. That example is stale: the table is empty.

Because the intent name is the policy name, a binding for `razorpay:refund` would name `customer-refund` as both the intent and the policy. Whether the code accepts that equality has not been checked.

## 8. Check of the intent name and the policy (14 November 2026)

The check found that the policy chosen for the binding is not the policy that authorizes Razorpay refunds.

**`customer-refund` 1.3.0 refuses every customer refund.** Its only rule is `reject-all-customer-refunds` (`"condition": { "always": true }`, action `reject`). Its description says Razorpay refunds go through `razorpay-refund`. Binding `razorpay:refund` to it would make every Razorpay refund rejected.

**`razorpay-refund` 1.1.0 is the policy that approves a Razorpay refund** (`policies/razorpay-refund/1.1.0/policy.json`). It requires `paymentRefundable` (a Razorpay signal source, `payment.refundable`, max age 60 s) to be true, and a signed `managerApproved`. It has a reject default. It is the only version in the repo.

So the connection table in section 7 is wrong on the policy. The intent name the owner stated (the policy name) would be `razorpay-refund`, not `customer-refund`.

The owner confirmed `customer-refund` 1.3.0 as correct (D14). That confirmation was made on the basis of this record, which named `customer-refund` as the latest version to bind. The owner should look at it again before it stands.

Intent name check in code: `packages/shared/src/domain/intent.ts` has no `name` or `policy` field, so the code does not link an intent to a policy by name. Whether an intent name equal to the policy name is accepted by any code path was not established.

Not changed: D14 and D15 are the owner's recorded decisions and are left as they stand.

## 9. Capability naming (owner statement, 14 November 2026)

The owner states: "connectorname_policyname_version is capability." No further detail was given. This is recorded as stated; it has not been confirmed as the intended format.

Code as it stands: capability names are validated as `namespace:verb`, one colon, lowercase letters, digits and hyphens. This is enforced in `packages/api/src/routes/external-connectors.ts` (`CAPABILITY_PATTERN`), `packages/api/src/routes/inbound-checks.ts` and `packages/api/src/routes/authority-grants.ts`. The form `connectorname_policyname_version` does not match that pattern (it uses underscores and has no colon). The connector uses `razorpay:refund`.

Open question for the owner: does "capability" in the owner's statement mean a new naming format, or a label for the combination of connector, policy and version? The answer decides whether the existing validation changes.

## 10. Customers (owner statement, 14 November 2026)

The owner states there are no live customers. So no customer is affected by the binding question, either way, now.

This does not change section 8. Binding `razorpay:refund` to `customer-refund` 1.3.0 would still reject every refund, and the binding would still point at the wrong policy. The risk is to correctness before launch, not to customers today.

## 11. Decision: capability naming (owner, 14 November 2026)

**Owner decision: option 1.** Capability names change to a connector, policy and version format. Recorded as D16 in `docs/ASSURANCE_DECISIONS.md`.

**Not yet decided:** the exact format. Version `1.3.0` contains dots, which the current name pattern does not allow. Options put to the owner:

- A: `razorpay_customer-refund_1-3-0` (dots replaced by hyphens).
- B: `razorpay_customer-refund_v1` (major version only).
- C: another format.

**Not yet done:** no code, connector or record has been changed. The change would touch the name check in `external-connectors.ts`, `inbound-checks.ts` and `authority-grants.ts`, the connector in `parmana-connectors` (which uses `razorpay:refund`), and any stored records.

**Open with this decision:** the policy the capability should point at. `customer-refund` 1.3.0 rejects every refund. The policy that approves Razorpay refunds is `razorpay-refund` 1.1.0. A rename does not fix this.

## 12. Format chosen: option A (owner, 14 November 2026)

**Owner choice: A.** The capability name would be `razorpay_customer-refund_1-3-0`: connector, policy and version, with dots in the version replaced by hyphens.

**Not done:** no code, connector or record has changed. Option A needs the name pattern changed in `external-connectors.ts`, `inbound-checks.ts` and `authority-grants.ts`, because the current pattern allows only one colon and no underscores. The connector in `parmana-connectors` would also be renamed from `razorpay:refund`.

**Concern to settle first:** option A puts the policy name and version into the capability name. Both point at `customer-refund` 1.3.0, which rejects every refund. Any rename would bake that wrong policy into the name, and changing the policy later would mean renaming again. Recommended: settle which policy and version the capability points at (`razorpay-refund` 1.1.0 is the one that approves refunds) before the rename.

## 13. Decision: the request defines the policy version (owner, 14 November 2026)

**Owner decision:** the request must define the policy version. The system does not pick a version from governance records.

**What this means:**

- A `razorpay:refund` request declares the policy name and version it relies on. The binder checks that declaration against the bound version.
- The governance-based version source (G-66) is not used for this capability. Its code stays in place, unused.
- When a new version is approved, callers must change their declared version before they can use it. Old versions are refused once the binding names a new one.

**Not done:** no code has changed. The binding itself is still not written (D15), and the version to bind is still open: `razorpay-refund` 1.1.0 is the only version in the repo.

Recorded as D17 in `docs/ASSURANCE_DECISIONS.md`.

## 14. Ambiguities in the code (checked 14 November 2026)

Checked by reading the code. Not tested.

1. **Two sources of the version in effect, by environment.** `createCurrentPolicyVersionSource` (`packages/api/src/bootstrap/createCurrentPolicyVersionSource.ts`) returns the governance source in production. In test and development, it returns nothing, and the version in the canonical table applies. The same binding can therefore behave differently by environment.
2. **Declared versus in effect.** `CapabilityPolicyBinder.findViolation` (`packages/capability-registry/src/CapabilityPolicyBinding.ts`) passes a request only if its declared name and version equal `policyInEffect`. So the request names a version, but governance decides which version is accepted in production. D17 says the request defines the version; the code also requires that version to be the one in effect.
3. **Correction to an earlier statement.** The governance version source is wired into the production API now. It has no effect on `razorpay:refund` only because that capability has no binding. Earlier I said it was not in use.
4. **No approval record.** If no version has been approved for a bound policy, the in-effect version is "unavailable" and the request is refused (`governedVersion`, read but not tested).
5. **External connectors.** Capabilities outside the built-in table use external bindings (`externalPolicyInEffect`). Their rule is not covered here.

**Open:** D17 should say exactly what it means: the request names a version, and the version accepted is the one in effect. Owner to confirm the wording, and whether the environment difference in item 1 is acceptable.

## 15. Decision: no fallback (owner, 14 November 2026)

**Owner decision:** no fallback. The version in effect comes from governance records only. The version written in the canonical table is not used as a fallback when governance is relaxed (test and development).

**What the code does today** (read, not changed):

- `createCurrentPolicyVersionSource` returns nothing when governance is relaxed. The binder then uses the version in the canonical table (`policyInEffect`, when `currentVersions` is undefined).
- Removing the fallback means that, with governance relaxed, a bound capability has no version in effect and its requests are refused.

**Implications to settle before code changes:**

- Test and development suites that rely on the table version will fail or need governance records. Which suites depend on it has not been checked.
- Without an approval record for `razorpay-refund` 1.1.0, `razorpay:refund` is refused in every environment.

**Not done:** no code or test has changed. The binding is still not written (D15), and the naming format (D16) is still unimplemented.

Recorded as D18 in `docs/ASSURANCE_DECISIONS.md`.

## 16. Code change for D18 (14 November 2026)

`createCurrentPolicyVersionSource` now returns the governed source in every environment. The environment check that turned it off in test and development is removed. The unit test asserts this for each environment setting.

**Checks run after the change:** typecheck exit 0. Seven test files, 62 tests, all passed: the version-source unit test, the four integration tests for policy-in-effect and capability scoping, and the capability-registry suite.

**Not changed:** `createPolicyExecutionVerifier` still uses `policyGovernanceRelaxed()` to decide whether execution-time governance is checked. That is a separate decision from version selection. It is still environment-dependent, and it is not covered by D18. Owner to decide whether it should follow the same rule.

**Not run:** the full suite.

## 17. Decision: execution-time governance follows the same rule (owner, 14 November 2026)

**Owner decision:** yes. The execution-time check (`createPolicyExecutionVerifier`) should follow the same rule as version selection: no relaxation by environment. Recorded as D19.

**Not done yet.** Making the change would affect far more than the version source:

- `vitest.setup.ts` sets `PARMANA_ALLOW_UNGOVERNED_POLICY`, so the whole unit suite runs with governance off. Removing the relaxation would make it require signed approval records in every test that executes a policy.
- 27 files set or document the flag, including `Doctor.ts`, `.env.example`, `.github/workflows/docker-image.yml`, the Python tests, scripts, tutorials, and the site and internal docs.
- `policyGovernanceRelaxed` is also used by `createPolicyExecutionVerifier` and, through it, by `createExecutionGateway`, `createSigningReadiness` and `createPolicyGovernanceAnchorResolver`.

**Proposed approach, to confirm before any code change:** test fixtures seed signed approval records, and the relaxation is removed from the production code path. The test setup and documentation changes are part of the same change.

**Not changed:** no code or test has been modified for this decision.

## 18. D19 measured (14 November 2026)

The change was made, measured, and then reverted, so the branch stays green.

**Change made (not committed):** `createPolicyExecutionVerifier` always returns the governed verifier. The gateway's ungoverned fallback is removed. `policyGovernanceRelaxed.ts` is deleted. The flag is removed from `vitest.setup.ts`. The patch is saved in the session scratchpad as `d19-production-and-setup.patch`.

**Full suite with the change (Node 24.22.2):** 25 files failed, 60 tests failed; 3,888 tests passed. The failures are executions refused for lack of a signed approval record. Most show `expected 403 to be 200` (or 201, 502, 503). Some tests check the refusal reason rather than the status.

**Files most affected:** `caller-scoping`, `caller-capability-scoping`, `caller-auth`, `rate-limit`, `production-gateway`, `trust-record-api`, `parmana-client` (TypeScript client integration), `examples` and others.

**Not decided:** how tests get approval records. Options for the owner:

1. A test-only fixture that seeds signed approval records for each policy the tests use, clearly labelled as test data.
2. Real signed approvals for the policies under test, produced through the normal maker-checker path.

Option 1 is the practical route, but it is the same relaxation moved into the test setup, so it needs an explicit decision. The backfill script (`scripts/backfill-legacy-policy-approvals.ts`) creates approvals under a synthetic system identity, and it should not be used as the test fixture without a decision.

**Also outside D19:** the signing-readiness check (`createSigningReadiness`) has its own environment rule, `SIGNING_READINESS_CHECK`. It is not covered by D19 and is unchanged. The doctor check (`packages/shared/src/config/Doctor.ts`) still lists the flag as a known setting; removing it from the list would make the doctor report a misleading typo.

## 19. D19 implemented in the test suite and production code (14 November 2026)

Supersedes section 18's "reverted" state. Branch `claude/d19-governance-everywhere`.

**Done:**

- `createPolicyExecutionVerifier` always returns the governed verifier. The gateway's ungoverned fallback is removed. `policyGovernanceRelaxed.ts` is deleted.
- `vitest.setup.ts` no longer sets the opt-in flag. Tests run governed.
- `test-support/policy-governance.ts` (test data only, never imported by production) seeds signed policy-governance approval records through the real `PolicyChangeApprovalService`, in ascending version order, so the highest version of each policy is in effect. `approvePolicyVersion` makes a chosen version in effect, for tests that need an older one.
- 25 failing test files call the seeding. The production-gateway file approves `access-control` 1.0.0 explicitly.
- Bug fixed in the in-memory approval repository (`packages/storage/src/memory/MemoryPolicyChangeApprovalRecordRepository.ts`): two approvals in the same millisecond tied, and the earlier one won. Ties now go to the later-inserted record. The Postgres repository orders ties by record id, which is random, so ties there are still unordered. Approvals by people are not normally that close in time, but this is not proven safe.
- `.env.example`, the handbook (`07-policy-governance-maker-checker.mdx`) and the environment-variable page are updated to the always-on rule.

**Checks:** typecheck exit 0. Full suite (Node 24.22.2): 403 files passed, 29 skipped; 3,948 tests passed, 1 expected fail, 106 skipped. Zero failures.

**Not done:**

1. **Out-of-process harnesses.** These start a separate API server, which has no approval records, so they will now be refused: the three Python live-server tests, `scripts/load-test.ts`, `scripts/run-examples.ts`, `scripts/drills/outage-drill.sh`, the docker smoke test in `.github/workflows/docker-image.yml`, and `examples/tutorials/81-connector-execution-gateway/run.ts` (in-process, not yet checked). They need a real approval path (the maker-checker API or `parmana-ops policy`) run before the server is used. This is a design decision with CI impact; it is not done.
2. **Runbooks and generated site text: done** for `ENV-VARIABLE-REFERENCE.md`, `ENV-FILE.md`, `PRODUCTION-ENVIRONMENT.md`, `FAULT-INJECTION.md`, and `llms-full.txt` (regenerated with `scripts/generate-llms-txt.ts`). The claims log (`CLAIMS-CHANGELOG.md`, `CLAIMS.md`) and the audit archive are historical records and are not edited.
3. **Doctor: done.** The flag is removed from `KNOWN_PARMANA_SETTINGS`. Setting it now produces "not read by any Parmana component, so it has no effect". Shared package tests: 175 pass.
4. **Signing readiness** (`createSigningReadiness`) has its own environment rule (`SIGNING_READINESS_CHECK`). It is not part of D19 and is unchanged.
5. **Postgres tie-break** (above). Not fixed. Fixing it needs a schema change (an insertion-order column, ordered on) and a migration, which needs your approval.
