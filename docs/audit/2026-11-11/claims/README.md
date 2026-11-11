# Parmana claims: verification folder

Source: pavancharak/parmana-core, docs/internal/CLAIMS.md, commit d1d63c6, run on Node 24.22.1.

## Full test run

- Test files: 403, 0 failed (374 reported passed, 29 skipped in the vitest summary)
- Tests: 3789 passed, 0 failed, 106 skipped (3895 total)
- Commands: `npm ci --ignore-scripts`, `npm run build`, `npm rebuild re2`, `npx vitest run`

## How to read each file

Each claim file has the claim text exactly as written in CLAIMS.md, the backticked repo paths it cites with an EXISTS or MISSING result, and the result of each cited test file in the full run.
A passing test file means its tests ran and passed. It does not show that the test covers every statement in the claim.

## Claims

| # | Claim | Cited paths missing | Cited test files | Test files passed | File |
|---|---|---|---|---|---|
| 2.1 | Trusted Business Transactions | 0 | 0 | 0/0 | [claim-2-1.md](claim-2-1.md) |
| 2.2 | Deterministic Policy Selection | 0 | 1 | 1/1 | [claim-2-2.md](claim-2-2.md) |
| 2.3 | Deterministic Policy Evaluation | 0 | 1 | 1/1 | [claim-2-3.md](claim-2-3.md) |
| 2.4 | Authorized Execution | 0 | 0 | 0/0 | [claim-2-4.md](claim-2-4.md) |
| 2.5 | Verifiable Execution Evidence | 0 | 0 | 0/0 | [claim-2-5.md](claim-2-5.md) |
| 2.6 | Independent Verification | 0 | 0 | 0/0 | [claim-2-6.md](claim-2-6.md) |
| 2.7 | Replay Support | 0 | 0 | 0/0 | [claim-2-7.md](claim-2-7.md) |
| 2.8 | Signed, Single-Use, Time-Bounded Execution Authorization | 0 | 0 | 0/0 | [claim-2-8.md](claim-2-8.md) |
| 2.9 | Independent Envelope Verification | 0 | 0 | 0/0 | [claim-2-9.md](claim-2-9.md) |
| 2.10 | Rejection of Forged, Tampered, Expired, and Replayed Authorizations | 0 | 0 | 0/0 | [claim-2-10.md](claim-2-10.md) |
| 2.11 | Trust Record Bound to Its Authorization | 0 | 0 | 0/0 | [claim-2-11.md](claim-2-11.md) |
| 2.12 | Fail-Closed Authorization on Rejection | 0 | 0 | 0/0 | [claim-2-12.md](claim-2-12.md) |
| 2.13 | Key/Algorithm Binding Guard | 0 | 0 | 0/0 | [claim-2-13.md](claim-2-13.md) |
| 2.14 | Configurable Post-Quantum Signing (ML-DSA-65) | 0 | 2 | 2/2 | [claim-2-14.md](claim-2-14.md) |
| 2.15 | Authorization-Binding Verification | 0 | 0 | 0/0 | [claim-2-15.md](claim-2-15.md) |
| 2.16 | Caller Authentication at the API Boundary | 0 | 4 | 4/4 | [claim-2-16.md](claim-2-16.md) |
| 2.17 | Fail-Closed Startup Configuration Validation | 0 | 0 | 0/0 | [claim-2-17.md](claim-2-17.md) |
| 2.18 | Key Provider Input Validation | 0 | 4 | 4/4 | [claim-2-18.md](claim-2-18.md) |
| 2.19 | Fail-Closed Caller-Authentication Audit Writes | 0 | 0 | 0/0 | [claim-2-19.md](claim-2-19.md) |
| 2.20 | Atomic Rejection of Duplicate Business Transactions | 0 | 0 | 0/0 | [claim-2-20.md](claim-2-20.md) |
| 2.21 | Distinguishable HTTP Status for Policy Denial and Replay | 0 | 4 | 4/4 | [claim-2-21.md](claim-2-21.md) |
| 2.22 | Canonical Capability-to-Policy Binding | 0 | 1 | 0/1 | [claim-2-22.md](claim-2-22.md) |
| 2.45 | Approver Keys Are Added and Revoked Through Maker Checker, With No Deploy (Scoped, 2026-09-29) | 1 | 1 | 0/1 | [claim-2-45.md](claim-2-45.md) |
| 2.46 | An Approver Is Notified When a Request Waits Only for Their Approval | 0 | 3 | 3/3 | [claim-2-46.md](claim-2-46.md) |
| 2.47 | No Action Is Authorized Without a Signed Human Approval, Reads Included | 1 | 5 | 5/5 | [claim-2-47.md](claim-2-47.md) |
| 2.48 | The Server Tells an Agent What a Request Must Carry (Scoped, 2026-09-30) | 0 | 3 | 2/3 | [claim-2-48.md](claim-2-48.md) |
| 2.51 | A Public Sandbox Runs the Same Governance With a Published Demo Key (Scoped) | 0 | 2 | 2/2 | [claim-2-51.md](claim-2-51.md) |
| 2.52 | A Request Whose Signals Do Not Have the Declared Types Is Refused (Scoped, 2026-10-05) | 0 | 1 | 1/1 | [claim-2-52.md](claim-2-52.md) |
| 2.53 | An Agent's Proposed Fact Is Not a Business Fact: Sourced Signals and Separate Authority, Validity and Execution Statuses (Scoped, 2026-10-10) | 0 | 3 | 3/3 | [claim-2-53.md](claim-2-53.md) |
| 2.54 | Any Business System Can Be a Trusted Signal Source: Registered Through Maker Checker, Asked With a Signed Query, Answers Verified (Scoped, 2026-10-11) | 0 | 5 | 4/5 | [claim-2-54.md](claim-2-54.md) |
| 2.55 | Per-Agent Authority: Grants With Limits and Expiry, Made Through Maker Checker, Checked Before Anything Is Asked (Scoped, 2026-10-11) | 0 | 9 | 8/9 | [claim-2-55.md](claim-2-55.md) |
| 2.57 | Proof Audit: Five Authorization Properties Tested by Execution (Scoped, 2026-10-16) | 0 | 1 | 0/1 | [claim-2-57.md](claim-2-57.md) |
| 2.58 | An Operator Can Stop All Execution, and the Stop Survives Restarts | 0 | 3 | 3/3 | [claim-2-58.md](claim-2-58.md) |
| 2.59 | A Policy Change Is Approved in Production Only by a Listed Checker, and the Approved Version Is Stored Durably (Scoped, 2026-10-21) | 0 | 2 | 2/2 | [claim-2-59.md](claim-2-59.md) |
| 2.24 | Authorization Is Caller-Type-Agnostic | 1 | 0 | 0/0 | [claim-2-24.md](claim-2-24.md) |
| 2.25 | Only Authorized Actions Take Effect: Status of the Internal Review | 0 | 1 | 1/1 | [claim-2-25.md](claim-2-25.md) |
| 2.26 | Policy Changes Need a Human Maker and a Different Human Checker | 0 | 4 | 4/4 | [claim-2-26.md](claim-2-26.md) |
| 2.27 | Policy-Freshness Enforcement at Execution Time | 0 | 1 | 1/1 | [claim-2-27.md](claim-2-27.md) |
| 2.28 | Key Resolution by Key ID, with Expiry and Revocation | 0 | 3 | 3/3 | [claim-2-28.md](claim-2-28.md) |
| 2.29 | Signal-Freshness Enforcement at Execution Time (G-31) | 0 | 3 | 3/3 | [claim-2-29.md](claim-2-29.md) |
| 2.30 | Policy-Authoring and Deployment Observability Warnings | 0 | 3 | 3/3 | [claim-2-30.md](claim-2-30.md) |
| 2.31 | Signed Caller-Capability Claim, Checked at the Connector Layer | 0 | 4 | 4/4 | [claim-2-31.md](claim-2-31.md) |
| 2.32 | Per-Caller Tamper-Evident Chaining on the Caller-Authentication Audit Trail | 1 | 3 | 3/3 | [claim-2-32.md](claim-2-32.md) |
| 2.33 | Authorization Envelope Bound Into the Trust Record's Own Signature | 0 | 3 | 3/3 | [claim-2-33.md](claim-2-33.md) |
| 2.34 | Policy Governance Integrity: Signature Verification, Record Chaining, Continuous Checks | 1 | 1 | 1/1 | [claim-2-34.md](claim-2-34.md) |
| 2.35 | Execution-Time Policy Governance Verification (Prevention, Always On Outside Test and Development) | 2 | 4 | 4/4 | [claim-2-35.md](claim-2-35.md) |
| 2.36 | Fail-Closed Policy Binding at the Execution Boundary | 0 | 2 | 2/2 | [claim-2-36.md](claim-2-36.md) |
| 2.37 | Large Message Signing Under AWS KMS (Commitment Scheme) | 0 | 3 | 2/3 | [claim-2-37.md](claim-2-37.md) |
| 2.38 | Signing Readiness Before Release, Explicit Failure After Release | 0 | 3 | 3/3 | [claim-2-38.md](claim-2-38.md) |
| 2.39 | Execution Intents: Signed Evidence Before Release, and a Repair Path | 0 | 3 | 3/3 | [claim-2-39.md](claim-2-39.md) |
| 2.40 | Self Hosted Deployment: One Command Start, Enforcement With No Internet Route (Scoped) | 1 | 4 | 4/4 | [claim-2-40.md](claim-2-40.md) |
| 2.41 | The TypeScript and Python SDKs Cover the Same Product API (Scoped, SDK 1.3.0, Published) | 0 | 2 | 1/2 | [claim-2-41.md](claim-2-41.md) |
| 2.42 | A Signed Human Approval Is Required Where a Policy Declares It | 0 | 4 | 4/4 | [claim-2-42.md](claim-2-42.md) |
| 2.43 | A Live Action's Policy Version Is Decided by Policy Governance, Not by a Deploy (Scoped, 2026-09-27) | 0 | 4 | 4/4 | [claim-2-43.md](claim-2-43.md) |
| 2.44 | An Agent Cannot Authorize an Action by Declaring Facts | 0 | 4 | 4/4 | [claim-2-44.md](claim-2-44.md) |
| 2.58 | Signing Keys Are Loaded From a Secret Manager at Startup, Not From an Environment Variable (Scoped, 2026-11-07) | 0 | 1 | 1/1 | [claim-2-58-b.md](claim-2-58-b.md) |
| 2.59 | Schema Version 3 Hybrid Records Verify in the SDKs, Including the Whole-Record Message (Scoped, 2026-11-07) | 0 | 2 | 1/2 | [claim-2-59-b.md](claim-2-59-b.md) |
| 3.1 | Non-Bypassable Envelope Verification (Scoped) | 1 | 0 | 0/0 | [claim-3-1.md](claim-3-1.md) |
| 3.2 | Fleet-Wide Single-Use Requires a Shared NonceStore | 0 | 0 | 0/0 | [claim-3-2.md](claim-3-2.md) |
| 3.11 | Durable, Third-Party-Verifiable Refusal and Audit Records (RFC-0021, Scoped) | 1 | 3 | 3/3 | [claim-3-11.md](claim-3-11.md) |
| 3.12 | Retired: separately published verification package | 0 | 0 | 0/0 | [claim-3-12.md](claim-3-12.md) |
| 3.13 | Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped) | 0 | 5 | 5/5 | [claim-3-13.md](claim-3-13.md) |
| 3.14 | Per-Caller Rate Limiting on `/execute` (Scoped) | 0 | 4 | 4/4 | [claim-3-14.md](claim-3-14.md) |
| 3.15 | SDK Dogfooding: Documented Quickstarts Now Proven to Actually Run (Scoped) | 1 | 2 | 1/2 | [claim-3-15.md](claim-3-15.md) |
| 3.16 | Caller-to-Capability Scoping (Scoped) | 0 | 2 | 2/2 | [claim-3-16.md](claim-3-16.md) |
| 3.18 | Deployment Infrastructure Requirements (Scoped) | 0 | 0 | 0/0 | [claim-3-18.md](claim-3-18.md) |
| 3.19 | Principal-Binding Denial Audit Trail (Scoped) | 0 | 3 | 3/3 | [claim-3-19.md](claim-3-19.md) |
| 3.20 | Structural Validation Rejection Audit Trail (G-29, Scoped) | 0 | 2 | 2/2 | [claim-3-20.md](claim-3-20.md) |
| 3.21 | Bulk/Compliance Export of Execution Trust Records (Scoped) | 0 | 1 | 1/1 | [claim-3-21.md](claim-3-21.md) |
| 3.23 | Listed as a TRACE External Evidence Source in the AgenTrust Integrations Repository (Scoped, 2026-10-12) | 2 | 0 | 0/0 | [claim-3-23.md](claim-3-23.md) |
| 3.24 | Policy Approval Scan and Governance UI Fail Closed (Scoped, 2026-10-15) | 0 | 0 | 0/0 | [claim-3-24.md](claim-3-24.md) |
| 3.25 | Vercel Entry Applies the Startup Refusals; POST /transactions Binds metadata.tenantId (Scoped, 2026-10-15) | 0 | 0 | 0/0 | [claim-3-25.md](claim-3-25.md) |
| 3.27 | The Server Distrusts eMudhra's emSign Roots at Startup (Scoped, 2026-10-23) | 0 | 1 | 1/1 | [claim-3-27.md](claim-3-27.md) |
| 3.28 | Three Evaluation Questions Checked Against the Source (Scoped, 2026-10-26) | 0 | 2 | 2/2 | [claim-3-28.md](claim-3-28.md) |
| 3.29 | Kill Switch, Approval Binding and Audit Tamper Checked Against the Source (Scoped, 2026-10-26) | 0 | 1 | 1/1 | [claim-3-29.md](claim-3-29.md) |
| 3.30 | Inbound Check Approves Only When the Bound Policy and the Grant Both Allow (Scoped, 2026-11-05) | 0 | 1 | 1/1 | [claim-3-30.md](claim-3-30.md) |
| 3.31 | The Inbound Decision Record Holds Any Action, and the Extension Is Applied (Scoped, 2026-11-05) | 1 | 1 | 0/1 | [claim-3-31.md](claim-3-31.md) |
| 3.32 | The Runtime Decides Without Executing, With Unchanged Behaviour (Scoped, 2026-11-05) | 0 | 0 | 0/0 | [claim-3-32.md](claim-3-32.md) |
| 3.33 | A Failed Kill Switch Probe Opens a P1 Issue (Scoped, 2026-11-05) | 0 | 1 | 1/1 | [claim-3-33.md](claim-3-33.md) |
