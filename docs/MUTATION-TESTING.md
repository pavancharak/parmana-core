# Mutation testing results

`npm run mutation -- <package>` (see [CONTRIBUTING.md](../CONTRIBUTING.md#mutation-testing))
makes small deliberate changes to a package's source, one at a time, and runs that package's
tests against each. A change the tests catch is **caught**; one they miss **survived**. The score
is the share caught.

This file records the first run on the five security-critical packages, what the surviving
changes showed, and what was done about them.

## How to read the scores

- **Only the package's own tests count.** Other packages' tests (the API's integration tests,
  for example) import the built package and cannot see Stryker's changes, so the real protection
  is higher than the score.
- **Some survivors change nothing observable.** An "equivalent" change, such as removing a check
  that a later check makes redundant, cannot be caught by any test. These are listed as such, not
  forced with artificial tests.
- **A low score in code that decides nothing is less urgent** than a survivor in a check that
  refuses an action. The write-up below separates the two.

## Scores

| Package             | First run | Caught       | Re-run on Node 24 | Caught       |
| ------------------- | --------- | ------------ | ----------------- | ------------ |
| `envelope-verifier` | 89.7%     | 104 of 116   | 94.0%             | 109 of 116   |
| `approval`          | 77.7%     | 380 of 489   | 93.9%             | 459 of 489   |
| `policy`            | 50.3%     | 659 of 1309  | 96.0%             | 1321 of 1376 |
| `execution-gateway` | 67.6%     | 1087 of 1607 | 83.6%             | 1343 of 1607 |
| `crypto`            | 65.4%\*   | 662 of 1012  | 85.0%             | 886 of 1042  |

First run and re-run: 2026-10-05. The number of changes differs where the fixes added code
(the signal type check, the chain check). A few tests were added after each re-run, for the
survivors it showed (listed below), so the current figures are slightly higher.

\* Measured on Node 22. The repository and CI run Node 24; on Node 22 the ML-DSA-65 and hybrid
signature tests skip themselves, so every change in those paths counted as missed. `npm run
mutation` now refuses to start below Node 24, and the re-run uses Node 24 for every package.

## What is left

The remaining survivors are, in nearly every case, one of:

- **Equivalent:** a guard that a later check repeats (the gateway's `passed &&` before each
  check), a check that cannot be reached because an earlier one already refused (the key file
  containment check in `FileKeyProvider`), or a fallback that gives the same answer (the
  envelope verifier's checks when no key resolves).
- **Advisory:** `PolicyValidator.findRuleConflicts`, which only logs possible rule overlaps.
- **Text:** wording and plural forms in error messages, request formatting in the built in
  connectors.

Survivors in a check that refuses an action were each given a test, checked by putting the
change back by hand.

## Re-run on Node 24: what the survivors showed

| Package             | Gap                                                                                                                                                                                         | Done                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crypto`            | The new partial chain refusal (G-89) could be removed: the rule refusing an unchained Execution after a chained one caught every case tested                                                | A partially chained first Execution tested, with its exact reason                                                                                     |
| `crypto`            | KmsSigner: an empty Sign or GetPublicKey answer, alias names with characters a key id may not have, the exact five minute cache                                                             | Tested                                                                                                                                                |
| `crypto`            | Hybrid verification with three entries or two of one algorithm, an empty `signatures` array, no `schemaVersion`; hybrid receipts; listing only public keys; the ML-DSA key's algorithm name | Tested                                                                                                                                                |
| `approval`          | The approval expiry comparison could become inclusive                                                                                                                                       | Refused at the exact instant it expires, accepted a millisecond before                                                                                |
| `policy`            | The ReDoS check's patterns for a quantifier with no comma (`(a+){2}`) and a ranged inner one (`(a{2,3})+`); the type labels for `null` and arrays                                           | Tested                                                                                                                                                |
| `execution-gateway` | The per authorization gateway token (`mintGatewayAuthentication`) could be ignored in favour of the static one; `HttpConnector` had no test                                                 | Tested: the minted token for this authorization is presented, the static one otherwise; `HttpConnector`'s request and its refusal of a non 2xx answer |
| `envelope-verifier` | 7 survivors, all equivalent                                                                                                                                                                 | Left                                                                                                                                                  |

## First run: what the survivors showed, and what changed

### envelope-verifier

12 survived. None let an invalid authorization through.

| Gap                                                                                 | Matters for security                  | Done                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| A key expiring at exactly now, and a key with a future expiry, were untested        | Boundary of key expiry                | Tested: rejected at the instant, accepted a millisecond earlier |
| The maximum lifetime (`maxTtlSeconds`) boundary was untested                        | Boundary of authorization lifetime    | Tested: inclusive at the limit, refused one second over         |
| The nonce store's purge boundary was untested                                       | Memory housekeeping only              | Tested                                                          |
| A request with no body at all was untested                                          | Robustness                            | Tested: 401                                                     |
| `keyValid`, `versionSupported` and `notExpired` forced to pass when no key resolves | No: the signature check already fails | Equivalent, left                                                |

### approval

109 survived. The main gap was in the scope comparisons that bound what an approval covers.

| Gap                                                                                                                                                            | Matters for security                                                          | Done                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ApprovalScopeEvaluator` (45.7%): only `eq` and `lte` were tested; `gte`, `lt`, `gt`, `between`, the boundaries and the refusal of non-number amounts were not | Yes: a policy using an untested comparator would rely on untested code        | Every comparator tested below, at and above its bound; non-numbers, malformed ranges and unknown comparators refused |
| `SignedApprovalGuard`: most field checks were never given a value of the wrong kind, and `null` was never tried where an object is required                    | Backup only: the signature check would still refuse                           | Each field tested with a wrong value                                                                                 |
| `ApprovalSignalVerifier`: paths outside `parameters`, paths through a non-object, non-finite amounts and resource ids                                          | Yes, as backup to JSON (which cannot carry Infinity)                          | Tested, with the exact refusal reason                                                                                |
| Labels and sort order in messages                                                                                                                              | No                                                                            | Left                                                                                                                 |
| Removing `keys.length === 0` in path resolution                                                                                                                | No: a bare `parameters` path resolves to an object, refused as missing anyway | Equivalent, left                                                                                                     |

### policy

650 survived, most of them in code that decides nothing at request time.

| Gap                                                                                                                                                               | Matters for security                                                                      | Done                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `OperatorEvaluator` (58.9%): boundaries, and what each operator does with a value of the wrong type, were untested                                                | Yes: every rule condition is decided here                                                 | 44 tests: every operator at its boundary and against wrong types                                   |
| `PolicyEngine` (63.8%, one test in this package): `any` was untested, as were the no-match result, first match, unknown actions and missing facts                 | Yes                                                                                       | 12 tests                                                                                           |
| `CompositeSignalStateVerifier` (0%): a version that ignored every verifier's refusals passed                                                                      | Yes                                                                                       | 4 tests                                                                                            |
| `FilePolicyRepository`: the character check was only tested behind the resolved-path check                                                                        | Backup layer of the path traversal guard                                                  | Names with a slash or a bare dot that stay inside the directory are now refused in a test          |
| `SignalIntentBinder`: a bound path through a string or null                                                                                                       | Yes                                                                                       | Tested                                                                                             |
| `PolicyValidator` (47.4%, 409 survivors): authoring-time validation of policy files                                                                               | Indirect: catches mistakes before approval, decides nothing at request time               | 126 tests: every refusal with its exact message, and the overlap analysis case by case             |
| `SupabasePolicyRepository` (0%, the production policy store), `FilePolicyRepository.listAll`, `PolicyRouter`'s conflict warnings, `PolicyRegistry`, error classes | Yes for the store: its name and version checks keep a request from addressing another row | Tested: name and version checks, query parameters and listing against a fake pool; the rest tested |

**Finding, now fixed:** signal types were not checked before rules ran. Each policy declares
them in `signalsSchema`, but that was only used to tell an agent what to send. A numeric signal
sent as text (`"150000"`) makes every numeric operator false, so a rule written as "reject if
amount gt X, otherwise approve" would not reject it. The shipped policies tested
(`customer-refund` 1.2.0) still refused such a request through a later rule and the approval
check, and no bypass was found. Now `PolicyEngine` refuses a request whose declared signals do
not have the declared types before any rule runs (`signal-type-violation`), and
`PolicyValidator` refuses a `signalsSchema` type other than `boolean`, `number` or `string`
([CLAIMS 2.52](CLAIMS.md), threat T18 in [THREAT-MODEL.md](../THREAT-MODEL.md)).

### execution-gateway

520 survived. The verdict itself was well tested: changing how the checks combine into a
release was caught in all but equivalent cases. The gaps were in what reaches the checks, and in
the layer between the Gateway and a connector.

| Gap                                                                                                                                                   | Matters for security                                                                                                                                                                                                     | Done                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `maxTtlSeconds`, `keyProvider` and `keyExpiryStore` could be dropped on the way to the envelope verifier                                              | Yes: a configured lifetime limit or key revocation would be silently ignored                                                                                                                                             | Tested: a longer lifetime refused, a key resolved through the provider, a revoked key refused                                   |
| The verified policy could be withheld from the release-time signal check                                                                              | Yes: bound signals are checked against it                                                                                                                                                                                | Tested                                                                                                                          |
| `InMemoryGatewaySessionAuthority` (67.1%): no field of the session binding was tested alone                                                           | Yes: a session must match connector, execution, authorization, content and expiry                                                                                                                                        | Each field tested alone, and the expiry boundary                                                                                |
| `DefaultSecureConnector`: either content hash comparison could be removed                                                                             | Yes                                                                                                                                                                                                                      | Both tested alone, with the audit reason                                                                                        |
| `CapabilityConnectorPolicy`, `DefaultExecutionChannel`, `InMemoryConnectorRegistry`: connector id, target prefix, unverified request, duplicate id    | Yes                                                                                                                                                                                                                      | Tested                                                                                                                          |
| `deepFreeze` (12.5%)                                                                                                                                  | Defense in depth: the hash comparison is the guarantee                                                                                                                                                                   | Tested                                                                                                                          |
| `ExternalConnectorAwareRegistry` and `GatewayCapabilityConnectorPolicy` (0%): only reached by the API's integration tests                             | Yes: a registration for another capability must never serve a request                                                                                                                                                    | 12 tests in this package                                                                                                        |
| A gateway without a `policyRepository`, or with an incomplete `executionControl`                                                                      | Fails at startup or before release                                                                                                                                                                                       | Tested                                                                                                                          |
| Release approvals with a non-string approver or key id, and a request with no signals                                                                 | Evidence of who approved                                                                                                                                                                                                 | Tested                                                                                                                          |
| Guards before each check (`passed &&`, `policyStillCurrent !== false`)                                                                                | No: the verdict requires every earlier check again                                                                                                                                                                       | Equivalent, left                                                                                                                |
| `GatewayExternalAdapter` (81.3%): response size boundaries, the single-address branch of the pinned DNS lookup, which refusal a malformed answer gets | Yes: the DNS pin guards against rebinding                                                                                                                                                                                | Tested through an injected request function: both lookup branches answer with the checked address; exact limits; exact refusals |
| Built in adapters (Paytm, HubSpot, Slack, GitHub, HTTP; 67 to 75%) and `SdkConnectorExecutor` (50%)                                                   | Partly: required fields, GitHub's refusal of `.` and `..` as a repository, placeholder tokens, HTTPS in production; the executor's version pin, unavailable connector, undeclared capability and raw credential refusals | Each tested with `fetch` stubbed; request formatting and error text left                                                        |

### crypto

350 survived on Node 22 (see the note under the scores). Beyond the skipped ML-DSA-65 paths, the
survivors showed one real weakness and several checks never tested on their own.

| Gap                                                                                                                                                                                                    | Matters for security                                                                                            | Done                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExecutionChainCrypto.verifyChain` skipped any Execution without both `chainHash` and `chainSignature` as legacy data, so an edited Execution with its `chainSignature` removed passed the chain check | Yes, as a second layer: the trust record's own signature still caught the edit                                  | Fixed (G-89 in [VERIFICATION-GAPS.md](VERIFICATION-GAPS.md)): an Execution with only some chain fields, or an unchained one after a chained one, is a break |
| `OfflineVerifier` hybrid path (63.4%): one bad signature among good ones, a single entry, a duplicate algorithm, an empty array, a key that cannot be read                                             | Yes: this is what an auditor runs                                                                               | 22 tests, each case with its exact result                                                                                                                   |
| `VerificationCrypto` (45.7%): requiring both the legacy and hybrid signatures, `HYBRID_SIGNATURE_REQUIRED`, the hash check on its own                                                                  | Yes                                                                                                             | Tested in hybrid mode on Node 24                                                                                                                            |
| Hash checks a matching signature made redundant in every test: execution chain, caller audit chain, `RefusalCrypto` (0%)                                                                               | Yes                                                                                                             | Each tested with only the stored hash changed                                                                                                               |
| `FileKeyExpiryStore` parsing: a non-object file, a non-date `expiresAt`, a non-boolean `revoked`                                                                                                       | Yes: a malformed entry must not leave a key valid                                                               | Tested with exact messages                                                                                                                                  |
| `FileKeyProvider`: the keyId pattern on its own (its containment check also refused every tested id)                                                                                                   | Yes: path traversal                                                                                             | Tested with ids that stay inside the directory                                                                                                              |
| `AuthorizationSigner` optional fields, `KeyPair` (0%), `ReceiptCrypto` (0%) in single mode                                                                                                             | Signed content; key handling                                                                                    | Tested                                                                                                                                                      |
| `FileKeyProvider`'s containment check                                                                                                                                                                  | No: a key file name always ends in `.public.pem` or `.private.pem`, so a valid keyId cannot leave the directory | Equivalent, left                                                                                                                                            |
