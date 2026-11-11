# 3.1 Non-Bypassable Envelope Verification (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1552-1565.

## Exact claim text

## 3.1 Non-Bypassable Envelope Verification (Scoped)

For any system running the Parmana envelope verifier, execution requests not authorized by Parmana are cryptographically impossible to accept.

This claim holds only for a receiving system that (a) runs @parmana/envelope-verifier and (b) gates every execution-triggering code path behind its verification result. Parmana enforces nothing at the network level. A receiving system that does not call the verifier, or that calls it but does not act on a failing result, is not covered by this claim.

**Update (2026-10-03):** the claim also assumes Parmana's authorization signing key is not compromised. Whoever holds that key, or can make the signing service sign (under AWS KMS, a process with `kms:Sign` on it), can produce authorizations the verifier accepts. "Not authorized by Parmana" means not signed with that key; it does not mean not approved by policy. See the attacker table in `docs/site/evaluation/audit-guide.mdx`.

Evidence

- @parmana/envelope-verifier (EnvelopeVerifier.verify, requireParmanaAuthorization)

---

## Cited evidence paths

- `docs/site/evaluation/audit-guide.mdx`: MISSING

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
