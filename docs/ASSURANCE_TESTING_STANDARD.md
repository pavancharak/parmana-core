# Parmana Systems
# Assurance Testing Standard

**Document:** PARMANA-ATS-001
**Version:** 1.0
**Status:** Proposed engineering standard. **Not adopted.** Adoption is decision 9.1 in [ASSURANCE_TESTING_PLAN.md](ASSURANCE_TESTING_PLAN.md) and needs a decision from Pavan Charak.
**Scope:** Parmana Core and all published packages
**Verified:** against the repository at commit `4a29854` on 14 November 2026. Corrections are listed in Appendix A.

---

## 1. Purpose

Establish a repeatable testing framework that verifies the correctness, integrity, security and reliability of Parmana.

The objective is not simply to establish that the software works under expected conditions.

The objective is to challenge whether the system preserves its declared guarantees under incorrect inputs, deliberate tampering, implementation defects, concurrency, dependency failures and adversarial conditions.

## 2. Engineering invariants

These are the properties that testing must protect.

| ID | Invariant | Required behavior |
|---|---|---|
| ATS-001 | Determinism | Equivalent inputs produce equivalent defined outputs |
| ATS-002 | Authorization | Unauthorized actions are rejected |
| ATS-003 | Integrity | Altered protected evidence is detected |
| ATS-004 | Verification | Invalid evidence cannot pass verification |
| ATS-005 | Trust | Untrusted keys cannot establish valid authorization |
| ATS-006 | Isolation | One agent cannot inherit another agent's authority |
| ATS-007 | Revocation | Revoked authority cannot authorize new execution |
| ATS-008 | Concurrency | Simultaneous operations cannot bypass limits |
| ATS-009 | Fail-closed | Verification failures cannot become approvals |
| ATS-010 | Evidence | Execution evidence corresponds to the actual decision |
| ATS-011 | Reproducibility | Tests can be repeated against the same source version |
| ATS-012 | Supply chain | Published artifacts correspond to validated source builds |

These invariants must be mapped to actual implementation functions and execution boundaries. The mapping is not yet written (see Appendix A, item A7).

## 3. Repository structure

The tree below is the **target** structure. Package names are the real directories under `packages/`. Where the target uses a name that does not exist, the nearest real package is shown in the table after the tree.

```text
parmana-core/
│
├── packages/                       (existing: api, approval, capability-registry, cli,
│                                    connector-sdk, crypto, envelope-verifier,
│                                    execution-control, execution-gateway, execution-system,
│                                    governance-ui, policy, replay, runtime, shared, storage)
│
├── tests/
│   ├── architecture/               (existing)
│   ├── unit/                       (existing)
│   ├── scripts/                    (existing)
│   └── assurance/                  (target; does not exist yet)
│       ├── crypto/
│       │   ├── canonicalization.test.ts
│       │   ├── hashing.test.ts
│       │   ├── signing.test.ts
│       │   └── vectors.test.ts
│       ├── verifier/
│       │   ├── signature-verification.test.ts
│       │   ├── evidence-tampering.test.ts
│       │   └── chain-integrity.test.ts
│       ├── authorization/
│       │   ├── boundary.test.ts
│       │   ├── credential-scope.test.ts
│       │   ├── revocation.test.ts
│       │   └── fail-closed.test.ts
│       ├── adversarial/
│       │   ├── malformed-input.test.ts
│       │   ├── replay.test.ts
│       │   └── privilege-escalation.test.ts
│       ├── concurrency/
│       │   ├── simultaneous-requests.test.ts
│       │   └── duplicate-execution.test.ts
│       ├── integration/
│       │   ├── governance-execution.test.ts
│       │   └── evidence-lifecycle.test.ts
│       └── fixtures/
│           ├── policies/
│           ├── evidence/
│           ├── keys/
│           └── malformed/
│
├── scripts/
│   ├── mutation.ts                 (existing)
│   └── assurance/                  (target)
│
├── docs/
│   ├── ASSURANCE_TESTING_PLAN.md   (existing)
│   ├── ASSURANCE_RESULTS.md        (existing)
│   ├── ASSURANCE_TESTING_STANDARD.md (this document)
│   └── assurance/                  (target: INVARIANTS.md, THREAT_MODEL.md, RELEASE_CHECKLIST.md)
│
└── .github/
    └── workflows/
        └── ci.yml                  (existing; extend this file, see Section 6)
```

Reuse existing test directories and configuration where they already serve the same purpose. Do not duplicate test infrastructure unnecessarily.

**Package mapping for the names used in this standard:**

| Name in this standard | Repository package | Status |
|---|---|---|
| crypto | `packages/crypto` | Exists |
| verifier | `packages/envelope-verifier` (`@parmana/envelope-verifier`) | Exists under a different name |
| governance | `packages/policy` and `packages/approval` | No package of this name. Candidate mapping, to confirm. |
| execution | `packages/execution-gateway` and `packages/execution-control` | No package of this name. Candidate mapping, to confirm. |
| bundle | None identified | No candidate. Policy bundles may belong in `packages/policy`; to confirm. |
| core | None identified | No candidate. To confirm. |
| server | `packages/api` | No package of this name. Candidate mapping, to confirm. |
| audit-db | `packages/storage` | No package of this name. Candidate mapping, to confirm. |
| verifier-cli | `packages/cli` | Candidate mapping, to confirm. |
| SDK client | `packages/connector-sdk`; `python-connector-sdk/` | Candidate mapping, to confirm. |

## 4. Testing categories and implementation

### 4.1 Mutation testing

Purpose: Determine whether tests detect deliberately introduced implementation changes.

Tool: the existing Stryker configuration (`stryker.config.mjs`) and `scripts/mutation.ts`.

Initial scope, using the real package names:
- `crypto`
- `envelope-verifier`
- `policy` and `approval` (governance)
- `execution-gateway` and `execution-control` (execution)

Commands (one invocation per package for clean reports):

```bash
npm run mutation -- crypto
npm run mutation -- envelope-verifier
npm run mutation -- policy
npm run mutation -- approval
npm run mutation -- execution-gateway
npm run mutation -- execution-control
```

Run mutation on Node 24. The repository and CI use Node 24, and the mutation script's own comment notes that on an older Node the ML-DSA-65 and hybrid signature tests skip, so their mutants survive and the score is wrong.

Acceptance:
- All critical survivors reviewed.
- No unexplained surviving mutations in critical authorization or integrity logic.
- Equivalent mutations documented.
- Mutation reports retained.

Do not introduce an arbitrary universal mutation score as a substitute for reviewing critical survivors.

### 4.2 Property-based testing

Purpose: Verify invariants across generated inputs.

`fast-check` is already a dependency (`^4.10.2`, root `package.json`). Do not add it again. Check the existing property and fuzz tests in `packages/crypto`, `packages/policy`, `packages/approval` and `packages/api` before writing new ones.

Example. **Illustrative only.** The repository has no function named `authorize`. Write the property against the real authorization function and its real signature, as the plan requires (Section 3 of the plan).

```typescript
import fc from "fast-check";

describe("Authorization invariants", () => {
  it("rejects every amount above the authorized limit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000000 }),
        fc.integer({ min: 0, max: 1000000 }),
        (amount, limit) => {
          const result = authorize({
            amount,
            limit
          });

          if (amount > limit) {
            expect(result.approved).toBe(false);
          }
        }
      )
    );
  });
});
```

Additional properties:
- Canonicalization is deterministic.
- Equivalent canonical inputs produce identical bytes.
- Verification rejects altered payloads.
- Invalid credentials cannot authorize execution.
- Policy changes cannot silently alter an already established evidence record.

Use deterministic seeds in CI so failures can be reproduced.

### 4.3 Cryptographic verification testing

Scope:
- SHA-256.
- Canonical JSON.
- Signature creation.
- Signature verification.
- Trust-root validation.
- Hash-chain integrity.

Tests must include:

| Test | Expected result |
|---|---|
| Valid signature | Pass |
| Altered payload | Reject |
| Incorrect key | Reject |
| Invalid signature bytes | Reject |
| Missing signature | Reject |
| Broken hash chain | Reject |
| Altered previous hash | Reject |
| Altered evidence | Reject |
| Canonical equivalent JSON | Same canonical representation |

Use independent published test vectors and RFC 8785 reference vectors. A test file for RFC 8785 exists (`packages/crypto/tests/unit/canonical-serializer-rfc8785.test.ts`). Its coverage of the reference vectors has not been reviewed.

Do not rely exclusively on signing and verification functions from the same implementation.

### 4.4 Authorization boundary testing

Test actual execution boundaries.

Required scenarios:

- Authorized operation.
- Unauthorized operation.
- Amount exceeding limit.
- Invalid vendor.
- Invalid agent.
- Expired credential.
- Revoked credential.
- Missing policy.
- Invalid policy signature.
- Unknown operation.
- Direct execution without authorization.

Acceptance:

No request outside declared authority may reach the protected execution operation.

### 4.5 Fuzz testing

Test malformed and unexpected inputs.

Input categories:
- Invalid JSON.
- Missing fields.
- Duplicate identifiers.
- Unexpected Unicode.
- Extremely large values.
- Invalid numeric representations.
- Deeply nested objects.
- Truncated evidence.
- Invalid signature encodings.

Acceptance:

Malformed input must not produce an unintended approval, crash that bypasses enforcement, or corrupt persistent evidence.

### 4.6 Adversarial security testing

Create attack scenarios around:

- Credential reuse.
- Replay attacks.
- Privilege escalation.
- Cross-agent access.
- Policy modification.
- Evidence modification.
- Trust-root substitution.
- Direct API bypass.
- Tenant isolation.

Use OWASP API Security guidance when defining the attack cases. The repository already has attack examples (35–46, 78) described in the plan; reuse them before defining new cases.

### 4.7 Concurrency testing

Test:
- Simultaneous authorization requests.
- Concurrent payments.
- Duplicate execution requests.
- Duplicate transaction identifiers.
- Revocation during execution.
- Policy changes during execution.
- Concurrent ledger writes.

Example acceptance scenario:

Given an agent with a ₹10,000 spending limit, two simultaneous requests of ₹7,000 must not both succeed if the limit is intended to apply cumulatively.

The implementation must provide the necessary atomicity at the persistence and execution boundary.

### 4.8 Fault injection

Simulate:
- Database unavailable.
- Network timeout.
- Policy lookup failure.
- Credential lookup failure.
- Signature verification failure.
- Ledger write failure.
- Incomplete execution context.

Acceptance:

Every required verification failure must prevent unauthorized execution. Retry behavior must not create duplicate transactions.

### 4.9 Integration testing

Verify package interactions. Names are the candidate mappings from Section 3.

| Integration | Required validation |
|---|---|
| Bundle → Crypto | Bundle integrity |
| Governance (`policy`, `approval`) → Verifier (`envelope-verifier`) | Authorization evidence |
| Governance → Execution (`execution-gateway`, `execution-control`) | Enforcement |
| Execution → Audit DB (`storage`) | Execution records |
| Core → All packages | Contract consistency |
| Server (`api`) → Core | API enforcement |

### 4.10 Performance testing

Establish measurable baselines before setting performance gates.

Measure:
- Authorization latency.
- Signature verification latency.
- Hashing throughput.
- Concurrent request throughput.
- Database write latency.
- Evidence verification throughput.

Never optimize performance by weakening authorization or integrity checks.

### 4.11 Reproducibility testing

Run equivalent tests across:
- Clean build environments.
- Repeated executions.
- Supported Node.js versions. The repository's `package.json` declares `node` `24.x`, and CI pins `24.22.2`. Do not claim support for other versions without running them.
- Different operating system environments where supported. CI runs on Linux.

Validate deterministic outputs and artifact hashes.

### 4.12 Supply-chain testing

Validate:
- Dependency vulnerabilities.
- Lockfile consistency (`package-lock.json` exists).
- Build artifact provenance.
- Package contents.
- Release signatures.
- CI build integrity.

Do not treat a successful dependency scan as proof that the application is secure.

## 5. Package-specific assurance matrix

Names are the candidate mappings from Section 3. Items marked "to confirm" must be checked before this matrix is relied on.

| Package (standard name → repository) | Mandatory assurance |
|---|---|
| crypto → `crypto` | Mutation, property, vectors, fuzz |
| verifier → `envelope-verifier` | Independent verification, tampering, mutation |
| governance → `policy`, `approval` | Authorization, revocation, fail-closed, mutation |
| execution → `execution-gateway`, `execution-control` | Boundary, concurrency, idempotency, fault injection |
| bundle → to confirm | Canonicalization, signatures, compatibility |
| core → to confirm | Integration, invariant preservation |
| audit-db → `storage` | Transactions, consistency, recovery |
| server → `api` | API security, authentication, integration, load |
| SDK client → `connector-sdk`, `python-connector-sdk` | Contract compatibility, error handling |
| verifier-cli → `cli` (to confirm) | Invalid evidence, exit codes, independent verification |

## 6. CI enforcement

Extend the existing CI workflow rather than replacing it. The repository has `.github/workflows/ci.yml`, which has jobs including `build-and-test`, `verify-policy-approvals` and `python-reference-drift`. There is no `governance-ci.yml`.

Proposed execution sequence:

```text
1. Install dependencies
2. Validate lockfile
3. Build all packages
4. Run existing regression tests
5. Run property-based tests
6. Run cryptographic test vectors
7. Run authorization boundary tests
8. Run integration tests
9. Run static security analysis
10. Verify package artifacts
11. Publish test reports
```

Mutation testing can run as a separate scheduled or dedicated CI workflow because of its execution cost.

Proposed release gates:

- All existing regression tests pass.
- All critical invariant tests pass.
- No unresolved critical security failures.
- No unexplained critical mutation survivors.
- No known failing cryptographic reference vectors.
- No unexplained integrity verification failures.
- Release artifacts correspond to the tested source version.

## 7. Assurance reporting

Every assurance run should produce a machine-readable report.

Recommended report structure:

```json
{
  "schemaVersion": "1.0",
  "project": "parmana-core",
  "assuranceRun": {
    "sourceRevision": "COMMIT_SHA",
    "startedAt": "RECORDED_TIMESTAMP",
    "completedAt": "RECORDED_TIMESTAMP"
  },
  "categories": {
    "mutation": {
      "status": "pending",
      "total": 0,
      "killed": 0,
      "survived": 0,
      "timedOut": 0
    },
    "property": {
      "status": "pending"
    },
    "cryptographicVerification": {
      "status": "pending"
    },
    "authorization": {
      "status": "pending"
    },
    "concurrency": {
      "status": "pending"
    }
  },
  "criticalFindings": [],
  "reviewedExceptions": [],
  "releaseDecision": "pending"
}
```

This is a proposed reporting schema, not an existing Parmana protocol format.

Never report an unexecuted test as passed.

The human-readable results log is `docs/ASSURANCE_RESULTS.md`. Its rules (append only, record only observed output) apply to these reports as well.

## 8. Implementation sequence

| Milestone | Deliverable |
|---|---|
| M1 | Crypto mutation testing completed |
| M2 | Crypto property and vector tests |
| M3 | Independent verifier test suite |
| M4 | Authorization boundary suite |
| M5 | Fail-closed and replay testing |
| M6 | Concurrency and fault injection |
| M7 | Integration and security testing |
| M8 | Assurance reporting and CI gates |

These milestones map to the phases in the plan. M1 is in progress (see `ASSURANCE_RESULTS.md`).

## 9. Definition of done

Parmana assurance is not complete simply because all tests pass once.

A release must have:

1. A defined set of invariants.
2. Tests mapped to each critical invariant.
3. Evidence of successful execution.
4. Documented unresolved exceptions.
5. Reproducible test results.
6. A validated release artifact.
7. An explicit release decision.

## 10. Governing principle

**We do not consider a guarantee established merely because the implementation claims to provide it.**

We test the implementation, challenge its assumptions, attempt to violate its boundaries and independently examine the evidence.

Parmana must be held to the same standard of accountability that it is designed to provide to autonomous systems.

**Authority defines the boundaries. Parmana enforces them. Evidence establishes accountability.**

---

## Appendix A. Verification record

Checked on 14 November 2026 against commit `4a29854`. Each item lists the statement in the proposed text, what the repository shows, and what was changed.

| # | Statement in proposed text | Finding | Change |
|---|---|---|---|
| A1 | Package directories `verifier`, `governance`, `execution`, `bundle`, `core`, `server`, `audit-db` | None exist under these names (only `crypto` matches) | Section 3 table added with candidate mappings. Target tree kept, labelled as target. |
| A2 | `npm run mutation -- verifier`, `governance`, `execution` | The script takes package names and its usage line says `envelope-verifier`. `governance` and `execution` are not packages. Stryker reads `packages/<name>/src`, so these commands would target missing directories. | Commands changed to real packages. Full list in 4.1. |
| A3 | PowerShell commands | Repository CI runs on Linux. No PowerShell use found in `.github` or `package.json`. | Changed to plain `npm run` commands in a bash block. |
| A4 | Mutation on any Node version | `scripts/mutation.ts` says Node 24 is required, because ML-DSA-65 and hybrid signature tests skip on older Node and mutants then survive. | Node 24 requirement added to 4.1. |
| A5 | "Recommended dependency: `npm install -D fast-check`" | Already in root `package.json` (`^4.10.2`) and used in five test files. | Install step removed; existing tests noted. |
| A6 | Example `authorize({ amount, limit })` | No function `authorize` exists in `packages/policy`, `packages/approval` or `packages/execution-gateway`. | Marked illustrative. The text now requires binding to the real signature. |
| A7 | Map invariants to implementation functions | Not done. The mapping needs the real function names. | Left open. Listed as a required follow-up. |
| A8 | Extend `.github/workflows/governance-ci.yml` | No such file. The workflow is `ci.yml`. | Changed to `ci.yml`, with its job names. |
| A9 | `tests/assurance/` as the test location, with existing tests reused | `tests/` contains `architecture`, `scripts`, `unit`. `tests/assurance/` does not exist. | Marked as a target. Existing directories listed. |
| A10 | Node versions | `package.json` `engines.node` is `24.x`; CI pins `24.22.2`. | Stated in 4.11. Other versions not claimed. |
| A11 | RFC 8785 vectors and property tests | A file for RFC 8785 exists. Coverage of the vectors not reviewed. | Noted in 4.3. |
| A12 | `package-lock.json` (lockfile validation) | Exists. Whether CI validates it has not been checked. | Left as a proposed step. |
| A13 | Invariant list ATS-001 to ATS-012 | Differs from the eight principles in Section 7 of the plan. ATS-005 (trust), ATS-010 (evidence) and ATS-012 (supply chain) have no direct counterpart. | Not reconciled. Owner decision: which list governs. |
| A14 | Gates, score rule and release gates | Consistent with plan Section 8. No change. | None. |

**Open items**

1. Decide whether this standard is adopted (plan decision 9.1). Until then it is a proposal.
2. Decide which invariant list governs: ATS-001 to ATS-012 here, or the eight principles in plan Section 7 (A13).
3. Complete the invariant-to-function mapping (A7).
4. Confirm the candidate package mappings for `bundle`, `core`, `server`, `audit-db`, `verifier-cli` and the SDK client (Section 3).
5. Create `tests/assurance/` only after adoption.
6. The scheduled and release gates depend on measured run times, which have not been recorded.
