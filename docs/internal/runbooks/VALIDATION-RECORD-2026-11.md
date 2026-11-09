# Validation record: 2026-11-09

This record covers the checks run on 2026-11-09 that need no business decision: the no-bypass probe, the verifier, and
the hybrid-mode test run. Each result is recorded as it happened, including the failure. It does not claim that any
business system is protected. That needs a business route and the owner's decisions (section 5).

- Parmana commit tested: `4f24fa4` (`main`, after PR #539).
- Verifier commit tested: `64a2950` (`parmana-verifier`, the version cloned on 2026-11-09).
- No production system was contacted. No production data was read or written by these checks.

## 1. No-bypass probe (G-146)

Purpose: confirm that the probe classifies its three outcomes correctly. The probe is specified in
`docs/internal/runbooks/BYPASS-PROBE.md`.

Method. Two local HTTPS servers stood in for a business route, using a self-signed certificate for `localhost`. The
probe requires `https`, so the certificate was trusted only for the probe process, through `NODE_EXTRA_CA_CERTS`. The
probe signing key was a freshly generated Ed25519 key, used only for this run. The servers were stopped afterwards.

| Case               | Target                     | Route behaviour       | Expected                     | Observed                              |
| ------------------ | -------------------------- | --------------------- | ---------------------------- | ------------------------------------- |
| Nothing configured | (none)                     | (no route)            | exit 0, "Nothing was probed" | exit 0, message as expected           |
| Route refuses      | `https://localhost:8441/x` | 401 for every request | exit 0, outcome `refused`    | exit 0, outcome `refused`, status 401 |
| Route accepts      | `https://localhost:8442/x` | 200 for every request | exit 2, outcome `bypass`     | exit 2, "Protection failed"           |
| Target not https   | `http://localhost:8441/x`  | (not contacted)       | exit 1, configuration error  | exit 1, "must use https"              |

Result: the probe's four outcomes behave as the runbook describes. The probe signs each record, and the refused record
carries a signature.

What this does not show: that any business route refuses direct calls. The probe was pointed at two local stand-ins.

## 2. Verifier test suite

Repository: `pavancharak/parmana-verifier`, commit `64a2950`. Command: `npm test`.

| Node version | Tests | Pass | Fail | Skipped |
| ------------ | ----- | ---- | ---- | ------- |
| 22.23.4      | 72    | 49   | 0    | 23      |
| 24.22.1      | 72    | 72   | 0    | 0       |

The 23 skipped tests on Node 22 are the ML-DSA-65 checks, which need Node 24 with OpenSSL 3.5 or later. The verifier's
own `REMAINING-WORK.md` records this requirement. Under Node 24, every test runs and passes.

What this does not show: that the verifier reads inbound decisions. It reads Execution Trust Records only (see G-143 in
`docs/internal/VERIFICATION-GAPS.md`).

## 3. Hybrid-mode test run

Command: `CRYPTO_MODE=hybrid npm test` in `parmana-core` at `4f24fa4`, under Node 24.22.1, after `npm run build`.

Result: **failed.** 43 test files failed and 133 tests failed. 324 files passed, 23 skipped. 3549 tests passed, 87 skipped.

Cause: the failing suites start a real local API. The API refuses to start in hybrid mode without a `default-secondary`
key, and `vitest.setup.ts` does not create that key. The error is "Refusing to start" with a message that names
`default-secondary`. This is the gap recorded in the handover, section 6, as the hybrid-mode test harness. It is a gap in
the test setup. It is not known to be a gap in the signing code, because the code does what it was written to do: it
refuses to start without the key.

Default mode (`CRYPTO_MODE` unset) is not affected. The full default suite last passed under Node 24 with 367 files
passed, 23 skipped, and 3682 tests passed, 87 skipped.

## 4. What was not validated

- **An end-to-end inbound check over HTTP.** `POST /v1/inbound/checks` is tested at the route and storage layers
  separately. A single test through the HTTP API, against the sandbox, has not been written or run.
- **A business system refusing direct calls.** The probe was run against local stand-ins only.
- **Hybrid mode.** Not runnable in the test setup until the `default-secondary` key is created in tests.
- **Verifying inbound records.** No verifier reads them (section 2).

## 5. Decisions needed from the owner

These are needed before any business route can be probed for real: the business route name, the two probe secrets, and the
decisions in the design for G-144 (sections 2 and 5). They are not needed for the checks above.

## 6. Next steps that need no decision

1. Create the `default-secondary` key in the test setup, so hybrid mode can run. This is a test-harness change, in its own
   PR, followed by the hybrid run again.
2. Write one HTTP-level inbound test against the sandbox, covering an approved decision with an approval, and check the
   four approval fields and the signature.
