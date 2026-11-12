# RFC-0028 — Evidence Trust, v1: knowing which key signed a record, and whether to trust it

Status: Draft

Author: (design draft, pending Pavan review)

Created: 2026-11-12

Updated: 2026-11-12

Target Version: unset — design document only, no implementation started

---

# Summary

A valid signature on a Parmana record shows that the record has not changed since it was signed
and that a particular key signed it. It does not show that the key was trustworthy when it signed,
or that it still is.

This RFC proposes three things for v1:

1. **A key registry**, in which every evidence-signing key has a stable identifier, a recorded
   validation result and a status. Keys are not trusted to sign until they are registered and
   validated.
2. **A split verification result**, which reports three things separately: the signature and
   integrity, the issuer trust at signing time, and the current status of the key.
3. **A test for a compromised key**, showing that a record signed by a key later marked compromised
   stays cryptographically valid but is reported as untrusted from the effective time onward.

No change to canonical serialization, SHA-256 chaining or existing signatures. No new cryptography.

The trigger is the October 2026 DSCI advisory on the eMudhra intermediate CA key compromise, which
was a failure in key generation, key selection and key lifecycle, not in the algorithm or the HSM.
The source for those facts is the advisory text supplied for drafting. It has not been checked
against the PDF.

---

# Motivation

`THREAT-MODEL.md` §6, assumption 1, says signing keys are not compromised, and threat A5 puts key
compromise out of scope. That is an honest statement of the current limit. But a verifier who
receives a record today has no way to learn which key signed it, whether that key was registered
and validated, or whether it has since been revoked. A valid signature is all they get.

The eMudhra case shows what that gap costs: a key generated with a weak parameter, a key referenced
by a label that pointed at the wrong key, and revocation that reached some verifiers but not others.
Parmana can close the first two in its own process for v1 and state the third as a limit.

---

# Goals

- Every key that signs evidence is registered with a stable identifier before it is used.
- Validation of strength and key identity is recorded before activation, and a failed validation
  blocks activation.
- A verifier can tell which key signed a record and what the registry said about that key at
  signing time.
- A record signed by a key later marked compromised is reported as untrusted from the stated
  effective time, and remains valid as a signature.

# Non-Goals

- Parmana does not become a certificate authority, and does not replace enterprise PKI or cloud KMS.
- No re-signing of existing records.
- No revocation distribution to external verifiers in v1. That belongs to the later specification.
- No trusted timestamp service in v1. Records keep their existing timestamps, and the RFC does not
  claim they prove when a record was made.
- No change to authorization. That remains with RFC-0021 and the policy and approval design.

---

# Proposal

## 1. Key registry

Each evidence-signing key has a registry entry with:

- a stable `keyId`
- the public key material, or a reference to it in KMS or an HSM
- the algorithm and parameters
- the key provider
- the evidence types the key may sign
- a status: `pending`, `active`, `retired` or `compromised`

Only `active` keys may sign. A signature by a key that is unregistered, pending, or registered for a
different evidence type is not accepted as evidence.

## 2. Validation before activation

Before a key becomes `active`, the registry records:

- **Strength:** the key meets the minimum for its algorithm.
- **Identity:** the public-key fingerprint, checked against the key the signer actually uses. Keys
  are referenced by fingerprint, not only by a label.

A failed check leaves the key `pending`. The result is stored, and the check is append-only.

## 3. Split verification result

The verifier returns three results:

1. **Signature and integrity:** the existing check, unchanged.
2. **Issuer trust at signing:** the key was `active` at the record's signing time, according to the
   registry.
3. **Current status:** the key's status now.

A record whose key was later marked `compromised` with an effective time after the record was signed
reports (1) valid, (2) trusted, (3) compromised. A record signed after the effective time reports
(2) untrusted. A missing key or an unvalidated key reports (2) untrusted and does not pass silently.

## 4. Compromised-key test

An adversarial test marks a key compromised with a stated effective time and checks that:

- a record signed before that time reports issuer trust and a valid signature
- a record signed after it reports untrusted issuer trust
- the signature result is valid in both cases

---

# Deferred to the ETVM specification

These are needed for a fuller model but are not part of v1:

- the full lifecycle (`rotated`, `revoked` and the transition history)
- revocation distribution, and how external verifiers report the age of their revocation data
- provenance fields on new records, signed into the record
- a trusted timestamp service, and the choice between RFC 3161 and an anchored log
- the revocation protocol: who may initiate it and how an uncertain effective time is recorded
- HSM and cloud KMS requirements for each provider

---

# Alternatives Considered

**A. Keep signature verification alone.** This is the current design. It cannot say whether a key
was trustworthy, and the eMudhra case shows a valid signature can come from a badly generated key.

**B. Full ETVM in v1.** The complete model is the right long-term target. Doing it before a single
signed release has run end to end would delay evidence that customers can check.

**C. Re-sign records when a key is compromised.** It would hide the compromise window. Rejected.

---

# Compatibility

- Canonical serialization, SHA-256 chaining and existing signatures: unchanged.
- Public API shapes: unchanged in v1. The verification result gains fields, which is additive.
- Offline verifier: its current behaviour becomes the "signature and integrity" result.

# Migration

The existing `default` and `gateway` keys are registered at the earliest time the system can establish.
The verification output states that this registration time is an assertion, not evidence, unless an
independent record of earlier activation exists.

---

# Risks

- **Overclaiming.** The registry shows what was registered and when, and what it says about status. It
  does not show that a key was never compromised. Public descriptions must say so.
- **Operational burden.** Validation adds steps to key operations. The steps must be hard to skip.
- **Process dependency.** Registry changes depend on the people running them. The maker and checker
  gap in `THREAT-MODEL.md` T11 applies here.

---

# Open Questions

1. Who may mark a key `compromised`, and does it need two people? One person holds both roles today (T11).
2. How is an uncertain compromise effective time recorded? A range is more honest than a guess.
3. Does the advisory's remediation match Parmana's setting? This needs checking against the PDF before the
   RFC relies on it.

---

# References

- `THREAT-MODEL.md` §4 (A5, A6), §5 (T3, T11, T12), §6 (assumptions 1, 2 and 4).
- `docs/internal/rfcs/RFC-0021-Refusal-Record.md` — storage and signing precedent.
- `docs/internal/rfcs/RFC-0022-Challenge-Record.md` — the reasoning on when signing does and does not help.
- DSCI advisory on the eMudhra intermediate CA key compromise, October 2026 (not yet checked against the PDF).
