# RFC-0030 — Hardware-bound approver keys

Status: Proposed. Phase 1 is partly done (see Progress). Decisions in section 9 need the owner's decision before Phase 2.

Created: 2026-11-16

Target Version: unset.

Related: THREAT-MODEL.md assumptions 2 and 9, and threats T2 and T11; RFC-0027 (bind approvals to every parameter); RFC-0028 (core holds no vendor secrets); docs/internal/indexes/adr-rfc-index.md.

---

# Summary

An approval is valid when a signature from a registered approver key verifies. Parmana cannot tell where that signature was made. Today an approver's private key is a file on the approver's machine (`scripts/generate-approver-key.ts`), and nothing checks that the agent cannot read it. If the key sits on the agent's machine, the agent can sign approvals, and Parmana accepts them.

This RFC proposes that approver private keys live on a hardware token that cannot export them, that Parmana verifies the token's attestation when an approver is registered, and that each approval carries a signature the token produces only after the approver confirms it on the device. Separation between the approver and the agent then comes from the hardware, not from a claim in the approval.

# Problem

1. **Separation is a rule, not a control.** THREAT-MODEL.md assumption 2 says approver keys are "held by the people they name." Parmana does not check this. The approval records no device or host.
2. **The key is a file.** `scripts/sign-approval.ts` reads a PEM private key from disk. Any process with read access to that file can sign.
3. **Registration does not check provenance.** The two-person change in `packages/api/src/routes/approval-issuers.ts` accepts a `publicKeyPem` from the proposer. It does not check where the key came from.
4. **The approval is a value an agent can copy.** An agent that holds a valid approval artifact and its signature can reuse it until it expires or its nonce is used. The nonce limits reuse, and the expiry limits the window. Neither proves a human saw the approval.

# Current state (verified in code)

- `packages/approval/src/ApprovalVerifier.ts`: `SUPPORTED_PAYLOAD_VERSION = 1`. The verifier checks the issuer is known, the signature verifies, and the nonce is unused.
- `packages/approval/src/ApprovalIssuerRegistry.ts`: `TrustedApprovalIssuer` holds `approverId`, `keyId`, a Node `KeyObject` public key, `revoked`, and `capabilities` (G-50).
- `packages/api/src/routes/approval-issuers.ts`: approver changes are proposed by one human and approved by another with a step-up signature. The maker is refused as checker (`SameActorCannotApproveOwnChangeError`). Keys listed in code cannot be changed here.
- Signing: `scripts/sign-approval.ts` (Ed25519, PEM file), `typescript/src/index.ts` (`signApproval`), `python/parmana/crypto/approval.py` (`signApproval`, Ed25519).
- Latest migration: `supabase/migrations/20261115140000_add_transaction_status_events.sql`.
- Tests: approval-issuer trust list, 17 passing (`packages/api/tests/unit/bootstrap/build-approval-issuer-registry.test.ts`, `governed-approval-issuer-registry.test.ts`). **No unit test exercises the approver-change routes** (propose, approve, reject, same-actor refusal, step-up). Those rules are tested only in DB-backed integration tests that did not run in the last full test run.

# Proposal

## 1. Approver keys are non-exportable hardware credentials

An approver's signing key is created on a hardware token (FIDO2 / WebAuthn security key, or a platform authenticator with hardware-backed storage). The private key never leaves the token. Parmana stores only the public key and the attestation.

## 2. Registration verifies attestation

A registration includes the attestation object from the token. Parmana verifies:

- the attestation statement and its certificate chain, against a trust-root list the owner maintains;
- the credential's public key, which becomes the approver key;
- the token's attestation format and AAGUID, against an allow-list of approved token models.

A key registered without a valid attestation is refused, and so is a file-generated key.

## 3. Each approval is a token assertion

The approval payload (approverId, keyId, capability, resourceId, optional maxAmount, expiry, nonce, and the RFC-0027 parameter hash once that RFC is implemented) is canonicalised. The token signs `SHA-256(canonical payload)` as a WebAuthn assertion, with user presence (touch) required. The token displays nothing itself, so Phase 5 defines how the approver sees what they sign.

The assertion, the authenticator data and the client data go into a new approval payload, version 2. Parmana verifies:

- the assertion signature against the registered public key;
- the user-presence flag is set;
- the challenge equals the hash of the canonical payload;
- the origin and RP ID match the value configured for the approval flow;
- the sign counter increases, or is zero for authenticators that do not count.

## 4. Version 1 is retired on a dated schedule

Version 1 (Ed25519 file keys) keeps working during migration. It is refused for any approver whose key is hardware-bound, and for all approvers after the cutover date. The cutover date is set by the owner (section 9).

## 5. Revocation and loss

- Revoking a key uses the existing `revoked` flag, through the same two-person change.
- A lost token is revoked on the same day. A replacement token is registered through a new two-person change, with a new key id.

## 6. Confirmation on a second device (draft)

A compromised approver workstation can show the approver a false request, and the approver's touch would then sign
it. The control that addresses this is a separate display. The approval request is sent to a second device the
workstation cannot write to, such as the approver's phone. That device shows the canonical payload (action, resource,
amount, expiry, and the parameter hash from section 7). The approver confirms on that device, and the token signature
is produced for the payload that device displayed.

- The workstation shows a short summary and a QR code or code phrase. The second device recomputes the payload from the
  code, so the workstation cannot display one request while the phone confirms another.
- The phone must be enrolled as the approver's second device through the same two-person change as the key (Phase 2). Its key is attested like the token.
- Limits: a device compromised together with the workstation defeats the separation, and the approver can still confirm
  an action they did not read properly. Section 7 and dual control (section 8) reduce both.

## 7. The approval is bound to the parameters that will run (RFC-0027)

Version 2 carries the parameter hash defined in RFC-0027. The gateway releases an action only when the executed
parameters hash to the value the approver confirmed. This removes the case where the approver approved one set of
parameters and a different set ran. It does not stop an approver from approving something they misread, which is why
the displayed payload in section 6 matters too.

## 8. Dual control above a threshold (draft)

Actions above a value set by the owner, or in a sensitive category, need two approvals from two approvers. Each
confirms on their own second device. The two approvals must come from different approver keys, and the maker cannot
be either approver. A compromised workstation then has to deceive two people, on two separate devices.

## 9. Limits and monitoring (draft)

Each approver token has a rate limit and an amount limit on approvals. Parmana records each approval attempt. An
approval outside the approver's normal pattern is refused or raises an alert to the owner. These limit the damage from
a successful attack. They do not stop one.

What the controls do not stop:

- An approver who confirms an action they did not understand, when it is shown correctly. Training and the displayed
  payload reduce this. They do not remove it.
- An attacker who controls both the workstation and the second device. Dual control covers large actions, but not
  every action.

# Why hardware

A software key is a file, or an entry in a keychain, on a machine the agent can also run code on. Three properties
are needed, and only hardware gives all three:

1. **The private key cannot be copied.** A software key is copied by copying a file. A hardware token generates the key
   on the device, and the private key never leaves it.
2. **A person was present for each signature.** A signature needs a physical confirmation on the token. A script that
   runs on the same computer cannot produce one without the person.
3. **Parmana can check where the key came from.** Attestation proves the key was created on a genuine token. Parmana
   can refuse a key that was imported from a file. Today a file-generated key cannot be told apart from a genuine one.

# Alternatives considered

| Alternative                                                                                              | What it gives                                                                                 | Why it is not enough alone                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep file keys, and keep them off the agent's host (the interim rule, in `THREAT-MODEL.md` assumption 2) | No cost. Done as an interim control.                                                          | Parmana cannot check the rule. A copied key still works, and there is no proof a person was present. Kept as the interim control only.                                                                          |
| Keys in the OS keychain or a TPM on the approver's computer                                              | The key is bound to the device. Stored by the platform.                                       | Any code running on that device can ask the key to sign, and no touch is required by default. The device is the place the attack happens.                                                                       |
| Platform passkeys (for example a phone or laptop passkey)                                                | A user-verified signature, with a clear enrolment flow.                                       | Signing still depends on the device's software. The key is not attested to a dedicated hardware token in the way section 2 needs. Could be reconsidered if its attestation is strong enough.                    |
| Cloud KMS, with the approver logging in to sign                                                          | The key never sits on a workstation. Access can be audited.                                   | Trust moves to the cloud account and its administrators. Separation depends on how that account is run, which Parmana does not check. Could serve as the server's own key store (RFC-0028), not the approver's. |
| Hardware token with per-approval touch (proposed)                                                        | Non-exportable key, a physical confirmation per signature, and attestation Parmana can check. | Does not stop malware from asking for a signature. Requires a second device to show the payload (section 6), and token loss handling.                                                                           |

The proposal is hardware with a per-approval touch, plus a second device for confirmation. The table shows that neither
part is sufficient on its own.

# Cost and effort (estimate)

These are estimates for planning. They have not been measured, and prices change, so check current figures before
budgeting.

- **Owner time:** days, for Phase 0 decisions. This is the main schedule risk, because later phases wait for it.
- **Engineering:** roughly 8 to 12 weeks in total for one or two engineers, across Phases 2 to 6. Phase 5, the approver
  display, is the largest uncertainty: a companion app for a phone is several weeks to months, and a web page is
  cheaper but gives weaker separation.
- **Hardware:** roughly $25 to $70 per token, with two tokens per approver recommended, so the cost scales with the
  number of approvers.
- **Operations:** a lost-token procedure, re-enrolment of every approver at cutover, and support for approvers.
- **Cheaper partial scope:** Phases 2 to 4 with a token and no second-device display takes about half the effort. It
  closes the "key on the agent's host" gap, and it does not close the malware or misreading gaps.

# Exact steps

Each phase has its own pull request, and no phase starts until the previous phase is merged and its acceptance check passes. Commands are run from the repository root.

## Phase 0: Decisions (no code)

0.1. Owner (Pavan Charak) decides the items in section 9.
0.2. Record the decisions as a decision record using `testing/templates/decision-record.md`, and link it from `docs/internal/DECISIONS.md`.
0.3. Acceptance: decisions are recorded with a date and the owner's name.

## Phase 1: Interim control and test gap (no format change)

1.1. Update `THREAT-MODEL.md` assumption 2 to read: "Approver keys are generated and kept on a machine the agent cannot read. Parmana does not enforce this. See RFC-0030." Update the T2 residual-risk text to point to RFC-0027 and RFC-0030.
1.2. Update the approver guide (`docs/site/guides/manage-approvers.mdx`) with the separation requirement and the steps in section 5 of this RFC.
1.3. Add unit tests for the approver-change routes in `packages/api/tests/unit/routes/approval-issuers.test.ts` (new file). Cover:

- propose requires a human caller and a `reason`;
- the proposer cannot approve their own change (`SameActorCannotApproveOwnChangeError`);
- approve and reject require a step-up authorization for that change id;
- a key id listed in code is refused for add and revoke;
- an approved change applies to the next approval checked (`GovernedApprovalIssuerRegistry`).
  1.4. Run `npx vitest run packages/api/tests/unit/routes/approval-issuers.test.ts` and `env -u DATABASE_URL -u TEST_DATABASE_URL npm test`.
  1.5. Acceptance: the new tests pass; the two docs changes are merged; no change to signed formats.

## Phase 2: Attestation at registration

2.1. Add a token-attestation verifier package `packages/approver-attestation/` (new). It uses a pinned, reviewed WebAuthn library. The version is chosen in this phase and pinned exactly in `package.json`.
2.2. Add `packages/approver-attestation/src/trust-roots.ts` (new), which loads the owner's trust roots and approved AAGUIDs from a versioned file under `policies/` or `config/`.
2.3. Add a migration `supabase/migrations/<timestamp>_approver_attestation.sql` that adds `attestation_format`, `aaguid`, `credential_public_key`, and `attested_at` to the approval-issuers table, nullable for existing rows.
2.4. Extend `POST /approval-issuers/changes` (`packages/api/src/routes/approval-issuers.ts`) so `add` accepts an `attestation` field and refuses it when verification fails. Existing file-key adds keep working until Phase 4.
2.5. Extend `TrustedApprovalIssuer` (`packages/approval/src/ApprovalIssuerRegistry.ts`) with `hardwareBound: boolean` and the attested AAGUID.
2.6. Tests: add to `packages/approver-attestation/tests/` valid and invalid attestations (wrong chain, unknown AAGUID, missing user verification, tampered authenticator data). Use recorded fixtures from the chosen library's test vectors.
2.7. Acceptance: a valid attestation registers, and each invalid case is refused with a named reason. No approval is verified differently yet.

## Phase 3: Version 2 approval (assertion)

3.1. Add version 2 to the approval payload type in `packages/shared` (`SignedApproval`, `ApprovalPayload`), keeping version 1 as-is.
3.2. Extend `ApprovalVerifier.verify()` (`packages/approval/src/ApprovalVerifier.ts`) so `SUPPORTED_PAYLOAD_VERSION` accepts 1 and 2. For version 2, verify the assertion as listed in section 3 of this RFC. Use the same nonce and expiry checks as version 1.
3.3. Add `scripts/sign-approval.ts` support for `--token` (WebAuthn assertion through the approver's authenticator). Keep `--private-key-file` for version 1 until Phase 4.
3.4. Add `signApproval` v2 to `typescript/src/index.ts` and `python/parmana/crypto/approval.py`. Pin any new dependency exactly.
3.5. Update `parmana-verifier` (`/home/user/parmana-verifier`, `src/verify.mjs` and `python/parmana_verifier/verify.py`) and `parmana-connect` to accept version 2, with the same test vectors in both languages.
3.6. Add shared test vectors at `packages/approval/tests/vectors/rfc-0030-v2.json` (new directory and file). Each vector holds a canonical payload, a token key, a signed assertion and the expected result. The core, TypeScript, Python and verifier suites all read this file, so the four implementations are checked against the same cases.
3.7. Tests: `packages/approval/tests/unit/ApprovalVerifier.test.ts` gains cases for: valid assertion; signature from another key; missing user presence; challenge that does not match the payload; wrong origin; replayed counter.
3.8. Acceptance: all four implementations pass the shared vectors, and version 1 approvals still verify.

## Phase 4: Cutover and retirement of file keys

4.1. Owner sets the cutover date (section 9).
4.2. Add a setting `PARMANA_APPROVAL_REQUIRE_HARDWARE=true` that refuses version 1 approvals and any approver key that is not hardware-bound. Default off until the cutover date.
4.3. Migrate each existing approver: register a hardware key through a new two-person change, then revoke the file key through a second two-person change.
4.4. Remove the file-key path from `scripts/sign-approval.ts` only after all approvers are migrated and the setting is on in production.
4.5. Acceptance: with the setting on, a version 1 approval and a file-key approver are each refused with a named reason, and each is covered by a test.

## Phase 5: Approver workflow and display

5.1. Define how the approver sees the action before touching the token. Options: a local approval client that shows the canonical payload, or the approval-needed notification (`packages/api/src/bootstrap/createApprovalNeededNotifier.ts`) rendering the payload for the approver to compare. Owner chooses (section 9).
5.2. Write the approver runbook: token setup, registration, signing, loss and revocation.
5.3. Acceptance: a test approver can complete a signing from the chosen client, and the runbook is reviewed by one approver who is not the author.

## Phase 6: Assurance and evidence

6.1. Add evaluation scenarios to `evaluations/scenarios.json`: a file-key approval refused after cutover; a version 2 approval whose assertion is replayed; a registration with an unapproved AAGUID refused.
6.2. Add the new claims to `docs/internal/CLAIMS.md` with the test that supports each.
6.3. Update `THREAT-MODEL.md` to remove assumption 2 as a residual risk for hardware-bound keys, and keep it for keys still on file.
6.4. Acceptance: `npm run evaluate -- EV-xx` runs for each new scenario and passes.

# Verification

- Per phase: the test commands in each phase, run with `env -u DATABASE_URL -u TEST_DATABASE_URL`.
- Full suite before each merge: `npm test`. The database-backed suites run only with a local or allow-listed test database, as in `test-support/database-target.ts`.
- Cross-implementation: the shared vectors in 3.6 must pass in core, TypeScript, Python, `parmana-verifier` and `parmana-connect`.

# Rollback

- Phases 1 and 2 are additive. Revert the pull request to roll back.
- Phase 3 is additive: version 1 keeps verifying.
- Phase 4: set `PARMANA_APPROVAL_REQUIRE_HARDWARE` to false to return to version 1. This is a stop-gap only, and the cutover is not final until the setting is on and file keys are revoked.

# Risks

- **Malware on the approver's computer can ask the token for a signature.** User presence and a display of the payload reduce this, but they do not remove it. This RFC does not claim to stop it.
- **Token loss or lockout.** Mitigated by section 5 and by registering two tokens per approver. This increases the number of keys to manage.
- **Algorithm support.** Many tokens sign with ES256 (ECDSA P-256), not Ed25519. Version 2 uses the token's algorithm, so the verifier, SDKs and `parmana-verifier` must support it. Confirm the token models first.
- **Library risk.** WebAuthn attestation verification is security-sensitive. Use a reviewed, pinned library and do not write the parser by hand.

# Section 9. Decisions needed from the owner

1. Token standard: FIDO2 / WebAuthn only, or also a platform authenticator?
2. Which token models and AAGUIDs are approved for approvers?
3. Attestation trust roots: which vendors' roots to accept?
4. Whether to require two tokens per approver.
5. Cutover date for refusing version 1 and file keys.
6. Whether approvals must show the full payload to the approver before signing (section 5.1), and by which client.
7. Whether RFC-0027 parameter binding ships before or with version 2. Recommended: with, so one signed payload carries both.
8. Second device for confirmation (section 6): which device, and how the payload is shown to the approver.
9. Dual control (section 8): the amount or category that needs two approvers, and whether the two approvers must hold
   different token models.
10. Limits (section 9): the default rate and amount limits per token, and who receives alerts.

# Open questions

- Does the RFC-0027 parameter hash need its own version, or is it a field in version 2?
- What is the sign-counter policy for authenticators that do not increment it?

# Non-goals

- This RFC does not stop an approver from approving something they misread. Showing the full payload (section 5.1) reduces that risk.
- It does not change the server's own keys, which are covered by RFC-0028 and the KMS/HSM key providers.
- It does not change how policies decide what needs approval.

# Progress

Recorded as facts, with the commit or file that shows each one.

- **Phase 1, step 1.1 (done, 2026-11-16).** `THREAT-MODEL.md` assumption 2 now states the interim rule: approver private
  keys stay on the approver's machine, never on the agent's host. Parmana does not enforce it.
- **Phase 1, step 1.2 (done, 2026-11-16).** `docs/site/guides/manage-approvers.mdx` has a section, "Where the private
  key is kept".
- **Phase 1, step 1.3 (done, 2026-11-16).** `packages/api/tests/unit/approval-issuers-governance.test.ts` (10 tests)
  covers the approver-change routes: human-only proposals, the same-actor refusal, step-up bound to the change, applied
  add and revoke, and rejection. These tests pass locally. The commit is `5bb3f13`.
- **Phase 1, step 1.4 (done, 2026-11-16).** The full suite passes under the CI job's flags (449 of 449 files). The
  GitHub Actions run of the branch passed (job 133205179580).
- **Phase 0 (not started).** The section 9 decisions are open. No owner decision is recorded.
- **Phases 2 to 6 (not started).** Nothing in them is built.
- **Draft sections added (2026-11-16).** Sections 6 to 9 (second-device confirmation, parameter binding, dual control,
  limits) and decisions 8 to 10. These are proposals, not decisions.
