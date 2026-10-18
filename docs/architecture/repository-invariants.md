# Repository Invariants — Phase 1F Canonical Reference

This document is the canonical reference for the architectural invariants established by Phases 1A to 1E (passive connector SDKs, execution ownership inside `execution-gateway`, internalized implementation, a single production execution pipeline) and locked permanently in Phase 1F. It supersedes informal descriptions scattered across prior phase reports (those reports remain in git history), but this document is what to trust for "is X enforced, and how."

Every invariant below is backed by an automated test that fails the build on violation, not by convention or code review discipline.

## How to run these checks locally

```
npm test -- --maxWorkers=2          # runs every invariant test below (they're plain vitest files)
npx vitest run tests/architecture/execution-boundary.test.ts             # just the repo-level checks
npx vitest run packages/execution-gateway/tests/unit/public-api-boundary.test.ts   # just the package-local public-API check
```

All of the above already run automatically in CI on every push and pull request — see [CI enforcement](#ci-enforcement) below.

---

## Invariant 1 — Connector packages own no production execution

**Rationale:** Phase 1B/1C's whole point was reducing `connector-sdk`/`connector-hubspot` to passive SDKs (capability constants, DTOs, schemas, signal models) with zero executable behavior. A connector package that makes a real HTTP call to a vendor would silently create a second execution path outside `ExecutionGateway`'s authorization/audit chain.

**Enforcement:** `tests/architecture/execution-boundary.test.ts`, describe block `"connector packages own no production execution"`. Scans every `.ts` file under every `packages/connector-*/src/` directory (discovered generically by listing `packages/*` and filtering for a `connector-` prefix — not a fixed package list) and asserts none contain a `fetch(` call.

**Expected failure mode:** Adding any `fetch(...)` call inside `packages/connector-sdk/src/**` or `packages/connector-hubspot/src/**` (or any future `connector-*` package) fails the corresponding `it.each` test with the exact file path in the failure message.

**Regression example:** A future PR adds a "convenience" method to `HubSpotCapabilities.ts` that calls the HubSpot API directly to check a token before returning capability constants. This test fails immediately, naming that file.

**Corresponding test:** `tests/architecture/execution-boundary.test.ts` → `describe("connector packages own no production execution")`.

---

## Invariant 2 — Only `execution-gateway` may implement `Connector`

**Rationale:** Phase 1C moved every executable vendor adapter (today `GatewayHubSpotAdapter`, `GatewayGitHubAdapter`, `GatewayPaytmAdapter`, `GatewaySlackAdapter` and `GatewayHttpAdapter`) into `execution-gateway`. A second package implementing the `Connector` interface would be a second, unaudited execution surface.

**Enforcement:** `tests/architecture/execution-boundary.test.ts`, describe block `"adapter ownership: only execution-gateway may implement Connector"`. Scans all `packages/*/src` for `implements Connector` and checks the result against a two-entry allowlist: the four gateway-owned classes, plus the one named `MockConnector` test double in `connector-sdk`.

**Expected failure mode:** Any new `implements Connector` outside `execution-gateway/src/connector-execution/` (and not the named mock) fails both `it()` assertions in this block, listing the unapproved file.

**Regression example:** Someone adds `class StripeConnector implements Connector` directly inside a new `packages/connector-stripe/src/` package instead of routing it through `execution-gateway`. Both assertions fail, naming `packages/connector-stripe/src/StripeConnector.ts`.

**Corresponding test:** `tests/architecture/execution-boundary.test.ts` → `describe("adapter ownership: only execution-gateway may implement Connector")`.

---

## Invariant 3 — Exactly one production execution pipeline (no direct `connector.execute()`/`adapter.execute()` outside two named sites)

**Rationale:** Phase 1E's core invariant: `RuntimeEngine → ExecutionGateway.execute() → ExecutionControlService → SecureConnector → SdkConnectorExecutor → Gateway-owned Adapter → Business System` must be the only path a business action can take. A stray direct call to a connector's `.execute()` anywhere else bypasses authorization, signal verification, replay protection, and audit generation entirely.

**Enforcement:** `tests/architecture/execution-boundary.test.ts`, describe block `"no direct connector.execute()/adapter.execute() call outside approved gateway-owned components"`. Scans all `packages/*/src` for the call-site pattern `connector.execute(`/`adapter.execute(` (distinct from method _definitions_) and checks the result against a closed, two entry, named allowlist:

| File                                                                         | Why it's approved                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/execution-control/src/ExecutionControlService.ts`                  | Canonical dispatch stage 1 — resolves a `SecureConnector` and calls its `.execute()` |
| `packages/execution-gateway/src/connector-execution/SdkConnectorExecutor.ts` | Canonical dispatch stage 2 — calls the raw vendor `Connector` after all checks pass  |

**Expected failure mode:** A third call site anywhere in `packages/*/src` fails the "every call site is on the approved list" assertion, naming the new file.

**Regression example:** A future refactor of a refund service adds a "fast path" that calls `this.connector.execute(...)` directly to skip the authorization ceremony for an internal retry. This fails immediately.

**Corresponding test:** `tests/architecture/execution-boundary.test.ts` → `describe("no direct connector.execute()/adapter.execute() call outside approved gateway-owned components")`.

---

## Invariant 4 — `RuntimeEngine` and `ExecutionTrustApplication` cannot bypass `ExecutionGateway`

**Rationale:** These are the two components positioned to reach a connector directly if someone got impatient with the abstraction. Both must depend only on the injected `ExecutionSystem` interface, never on `execution-gateway`, `connector-sdk`, or `connector-hubspot` concretely.

**Enforcement:** `tests/architecture/execution-boundary.test.ts`, describe blocks `"RuntimeEngine cannot bypass ExecutionGateway"` and `"ExecutionTrustApplication cannot bypass ExecutionGateway"`. Each asserts the named file: exists; imports none of `@parmana/execution-gateway`, `@parmana/connector-sdk`, `@parmana/connector-hubspot`; contains no `new (Gateway|Connector|Http|HubSpot)*(` construction; contains no `fetch(` call.

**Expected failure mode:** Adding any of those imports/constructions to either file fails the corresponding `it()`.

**Regression example:** A "quick fix" imports `GatewayPaytmAdapter` into `RuntimeEngine.ts` to special case a refund retry inline. Fails on the import-absence assertion.

**Corresponding test:** `tests/architecture/execution-boundary.test.ts` → the two `describe` blocks named above.

---

## Invariant 5: API routes and bootstrap never execute business actions directly

**Rationale:** HTTP routes should only ever call `application.execute(...)` (the top-level `ExecutionTrustApplication` entry point), and bootstrap composition should only construct objects, never call `.execute(`.

**Enforcement:** `tests/architecture/execution-boundary.test.ts`, two describe blocks:

- `"API routes never execute adapters directly"` — scans `packages/api/src/routes/` generically for adapter imports/construction/`fetch(`.
- `"bootstrap composes but never executes business actions"` — scans `packages/api/src/bootstrap/` generically for any `.execute(` call.

**Expected failure mode:** A new route file constructing an adapter, or a bootstrap file calling `.execute(`, fails its respective `it.each`.

**Regression example:** A new `packages/api/src/routes/admin-replay.ts` route is added that directly constructs `createGatewayPaytmConnector()` and calls it to "replay" a refund for debugging. Fails the routes-block assertion.

**Corresponding test:** `tests/architecture/execution-boundary.test.ts` → the two describe blocks named above.

---

## Invariant 6 — Package-level ownership: only `execution-gateway`/`api` may depend on `execution-control`/`execution-gateway`

**Rationale:** Invariants 1–5 check source _content_ (import statements, call sites) inside specific, named files or directories. This invariant checks the same guarantee at the _package_ level, generically, so a brand-new package — one that doesn't exist yet and therefore isn't named anywhere in this file — is covered automatically the moment it imports `@parmana/execution-control` or `@parmana/execution-gateway` from somewhere it shouldn't.

**Enforcement:** `tests/architecture/execution-boundary.test.ts`, describe block `"package-level ownership: execution-control and execution-gateway have a closed dependent set"`. Scans every file across every package's `src/` for `from "@parmana/execution-control"` / `from "@parmana/execution-gateway"` import statements and checks the importing package against an allowlist:

- `@parmana/execution-control` may be imported by: `execution-control` itself, `execution-gateway`, and `api`.
- `@parmana/execution-gateway` may be imported by: `execution-gateway` itself and `api`.
- A separate, generic assertion additionally confirms no package whose name starts with `connector-` (present or future) imports either.

**Note on the former `receipt` exception:** `packages/receipt` used to contain an `ExecutionReceiptBuilder`/`ExecutionReceipt` pair that imported the `ExecutionPermit` type from `@parmana/execution-control` (type-only, no executable class, no `.execute()` call). Both, along with the `ExecutionPermit`/`ExecutionPermitBuilder` (execution-control) and `ExecutionTrustAttestation`/`ExecutionTrustAttestationBuilder` (execution-system) types they depended on, were deleted as unused scaffolding by the Hybrid Signature Support milestone (Phase A): none of them had test coverage or any caller outside their own package's index file. `packages/receipt` no longer imports `@parmana/execution-control` at all, so the allowlist entry above was removed rather than left stale.

**On dependency-cruiser:** This repository has a `.dependency-cruiser.cjs` config with five pre-existing rules (`no-circular`, `shared-must-not-import-project`, `policy-must-not-depend-on-runtime`, `gateway-must-not-depend-on-api`, `connector-must-not-call-api`), but it is not wired into any npm script or CI step, and — discovered while investigating whether to extend it for this phase — it does not currently resolve `@parmana/*` workspace-scoped imports at all for this repo's TypeScript-project-references + `NodeNext` module resolution setup (verified directly: a known real import of `@parmana/execution-control` from `GatewayConnectorRegistry.ts` resolves to zero dependency edges in dependency-cruiser's own JSON output, as do its `@parmana/crypto` and `@parmana/connector-sdk` imports). Its five existing rules have therefore likely never caught a real cross-package violation. Wiring a silently-non-functional check into CI would create false confidence, so Phase 1F did not do that; this invariant is enforced instead by extending the text-scanning mechanism already proven to work (Invariants 1–5 use the same mechanism). Fixing dependency-cruiser's TS-project-references resolution is a legitimate follow-up but is orthogonal tooling debt, not an execution-architecture regression, and is out of Phase 1F's scope.

**Expected failure mode:** A package outside the allowlist importing either `@parmana/execution-control` or `@parmana/execution-gateway` fails the corresponding `toEqual([])` assertion, naming the file.

**Regression example:** A future `packages/connector-stripe` package imports `SessionCredentialSecureConnector` from `@parmana/execution-control` to "wire itself up directly" instead of going through `execution-gateway`. Fails both the specific allowlist check and the generic "no connector package" check.

**Corresponding test:** `tests/architecture/execution-boundary.test.ts` → `describe("package-level ownership: execution-control and execution-gateway have a closed dependent set")`.

---

## Invariant 7 — Public API boundary: execution-gateway's implementation classes stay internal

**Rationale:** Phase 1D internalized `GatewayConnectorRegistry`, `GatewayCapabilityConnectorPolicy`, `SdkConnectorExecutor`, `CredentialVaultAdapter`, the vendor adapters and `ConnectorEvidence` behind stable factory functions (today `createGatewayConnectorRegistry`, `createGatewayHubSpotConnector`, `createGatewayGitHubConnector`, `createGatewayGitHubCredentialProvider`, `createGatewayPaytmConnector` and `createGatewaySlackConnector`). If any of these classes leak back into the public package barrel (`packages/execution-gateway/src/index.ts`), external packages regain the ability to construct raw adapters directly, silently reopening Invariant 2/3's bypass surface.

**Enforcement — two complementary layers:**

1. `packages/execution-gateway/tests/unit/public-api-boundary.test.ts` (Phase 1D) — imports the package's public entry point (`src/index.ts`, resolved directly by Vitest — not the built `dist/index.js`) at runtime and asserts a named list of 10 internal symbols is absent (`Object.prototype.hasOwnProperty`), and that the 3 factories + `ExecutionGateway` are present.
2. `tests/architecture/execution-boundary.test.ts`, describe block `"Phase 1D public API boundary stays generically enforced"` (added Phase 1F, closing a gap identified in Task 1's inventory: layer 1's list is hardcoded, so a _new_ internal class added to `connector-execution/` later wouldn't be covered until someone remembered to add its name). This layer derives the "must stay internal" symbol set _from `connector-execution/index.ts` itself_ (every file it re-exports, minus the public factory files) rather than from a hardcoded list, then asserts none of those symbol names appear in the public barrel's source text (comments stripped, to avoid false positives from explanatory prose).

**Expected failure mode:** Re-adding `export * from "./connector-execution/index.js"` to `packages/execution-gateway/src/index.ts` (undoing Phase 1D), or individually re-exporting any one internal class, fails both layers — layer 1 immediately for the 10 named classes, layer 2 for any of them _and_ for any new implementation class added later.

**Regression example:** A future contributor adds a ninth implementation class, `GatewayStripeAdapter`, to `connector-execution/`, and — out of habit, mirroring the existing `export *` lines — adds `export { GatewayStripeAdapter } from "./connector-execution/GatewayStripeAdapter.js"` directly to the public `index.ts` instead of following the factory pattern. Layer 1 doesn't know this class exists yet and passes. Layer 2 derives its expected-internal set from `connector-execution/index.ts` at test-run time, sees `GatewayStripeAdapter` in the re-exported-files list, and fails.

**Corresponding tests:** `packages/execution-gateway/tests/unit/public-api-boundary.test.ts` (layer 1) and `tests/architecture/execution-boundary.test.ts` → `describe("Phase 1D public API boundary stays generically enforced (not just a hardcoded symbol list)")` (layer 2).

---

## Invariant 8: No AI agent action is authorized without a signed human approval

**Rationale:** the product rule, stated by the operator on 2026-09-30: no agent can do anything, reads included, without a person's approval. Before it was enforced, human approval was a property of a few policies, and most actions (GitHub reads, HubSpot reads and updates, Slack posts, every reference policy) were authorized on facts the agent declared or on nothing (`docs/VERIFICATION-GAPS.md` G-80).

**Enforcement:** `PolicyValidator.validateEveryApprovalNeedsSignedApproval` (`packages/policy/src/PolicyValidator.ts`) refuses any policy with an approve rule that does not require a fact declared in `approvalSignals` with `is_true`, as the rule's whole condition or directly inside its top level `all`. `PolicyRouter` runs it on every load and `pending-policy-changes.ts` on every proposal. `ApprovalSignalVerifier` counts that fact as true only with a valid signed approval, and `RuntimeEngine` refuses an approve decision when no signal state verifier is configured.

**Expected failure mode:** a new or changed policy file whose approve rule skips the approval fails `packages/policy/tests/unit/ReferencePolicies.test.ts` (the newest version of every policy must load), and the policy is refused at load (`400`) and on proposal.

**Regression example:** a PR adds `policies/github-pr-read/1.2.0` with `{ "always": true }` to make reads frictionless. `ReferencePolicies.test.ts` fails naming the file, and a server loading it refuses every read.

**Corresponding tests:** `packages/policy/tests/unit/PolicyValidator.test.ts` ("no approval without a signed human approval"), `ApprovalBackedPolicies.test.ts`, `ReferencePolicies.test.ts`, `packages/runtime/tests/unit/runtime.test.ts`.

---

## CI enforcement

CI exists: `.github/workflows/ci.yml`, triggered on every push to `main` and every pull request. Its steps: checkout → `npm ci` → `npm run build` → `npm run lint` → `npm run typecheck` → a retired-terminology grep guard → `npm test`.

`npm test` runs `vitest run`, whose root config (`vitest.config.ts`) includes `**/tests/**/*.test.ts` and `**/test/**/*.test.ts` repo-wide with no package scoping — so both `tests/architecture/execution-boundary.test.ts` and `packages/execution-gateway/tests/unit/public-api-boundary.test.ts` are already picked up and run automatically, with no CI configuration changes required. Confirmed directly: the full `npm test` run used to validate this phase reports all of them passing as part of the same 888-test run (see Task 6 results).

No new CI step was added this phase. An attempt to add one (wiring `dependency-cruiser` into CI to strengthen Invariant 6) was made and then reverted after discovering the tool doesn't actually resolve the relevant imports in this repo (see Invariant 6's note) — shipping that would have been a CI step that always passes regardless of whether the invariant holds, which is worse than no step.

---

## Non-goals of this document

This document covers **execution-ownership and API-boundary** invariants only (Phases 1A–1E's subject matter). It does not re-document credential-handling semantics, authorization ordering, signal verification, replay protection, or audit generation — those are unchanged by every phase covered here and are exercised by the existing production test suites (`packages/execution-control/tests`, `packages/execution-gateway/tests`, `packages/runtime/tests`, `packages/api/tests`), not by the architecture tests referenced above.
