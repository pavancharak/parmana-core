# G-134 end to end: pinning the connector's Parmana public key

- **Status:** code done and tested. Deployment not done. Gap G-134 stays **open**.
- **Last updated:** 2026-11-25
- **Owner decision needed:** the production fingerprint, confirmed through a second channel, and who pins it on the deployed connector.

## 1. The problem

A release-only connector trusts whatever key `PARMANA_PUBLIC_KEY_FILE` holds. The pin, `PARMANA_EXPECTED_KEY_FINGERPRINT`, was optional, and nothing was compared unless it was set. A replaced key file would start unnoticed and accept releases signed by the new key.

## 2. What now happens

| Situation                                                                 | Before           | Now                                      |
| ------------------------------------------------------------------------- | ---------------- | ---------------------------------------- |
| Release-only on (default), no pin                                         | Starts           | Refuses to start                         |
| Release-only on, pin matches                                              | Starts           | Starts                                   |
| Release-only on, pin does not match                                       | Refuses to start | Refuses to start                         |
| Release-only on, local development with `PARMANA_ALLOW_UNPINNED_KEY=true` | n/a              | Starts, unpinned                         |
| Release-only off                                                          | Starts, unpinned | Starts, unpinned (unchanged, by design)  |
| `npm run doctor`, no pin, release-only on                                 | Warns            | Fails, and prints the fingerprint to pin |

## 3. Where each piece is

| Repository      | Branch                           | Commits                                             | What it holds                                                                                                                                         |
| --------------- | -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| parmana-connect | `claude/g-134-pin-connector-key` | `13d17e5` (code), `ddf6626` (docs and runbook)      | The startup refusal, the doctor failure, tests, README, `docs/DOCTOR.md`, `docs/REMAINING-WORK.md`, `docs/runbooks/KEY-PIN-RUNBOOK.md`                |
| parmana-connect | `claude/format-readme-doctor`    | `d7c48a2`                                           | Formatting only for `README.md` and `docs/DOCTOR.md`. Based on the commit before G-134, so it must be merged with the G-134 branch.                   |
| parmana-core    | `claude/g-134-records`           | `8c750ab` (records), `e335cbe` (Node 24 correction) | Gap register, audit file, status, index, enforcement doc, fixtures doc, checklist in `docs/internal/documentation-updates/2026-11-25-g134-key-pin.md` |
| parmana-docs    | `claude/g-134-records`           | `2245682`                                           | Enforcement doc and gap register copies                                                                                                               |

No pull request is open on any of these branches.

## 4. Verification done

- **Connector unit tests:** 188 passed, 7 skipped, 16 files, on Node 22 and on Node 24.4 (v24.22.3). `tsc --noEmit` passes. The build passes.
- **Pin tests:** the startup refusal when no pin is set, the opt-out, the release-only-off case, and the mismatch case (`tests/config-pins.test.ts`, `tests/release-only.test.ts`).
- **Doctor tests:** the key check fails with no pin under release-only, and warns only when release-only is off or the opt-out is set (`tests/doctor.test.ts`).
- **Fingerprint one-liner:** the command in the runbook gives the same value as the connector's own `fingerprintOf`, checked on a generated key.
- **Prettier:** the new runbook passes. `README.md` and `docs/DOCTOR.md` pass on the formatting branch only.

## 5. Not verified

- The production fingerprint has not been obtained or confirmed through a second channel.
- Nothing is set on a deployed connector.
- No live run against a deployed connector or a deployed parmana-core.
- `npm run doctor` and a service start on Node 24 have not been run. Only the unit tests have run there.
- Prettier passes on the formatting branch only. The G-134 branch still has the unformatted copies of `README.md` and `docs/DOCTOR.md`.

## 6. Partner procedure

Follow `docs/runbooks/KEY-PIN-RUNBOOK.md` in parmana-connect. In short:

1. `npm ci`, `npm run build`, `npm run doctor`. The key check fails and prints the `sha256:` fingerprint.
2. Confirm the fingerprint with the Parmana operator through a second channel.
3. Set `PARMANA_EXPECTED_KEY_FINGERPRINT` in the deployment settings. Run doctor again, then start the service.
4. Run the wrong-value test once.
5. Return the evidence listed in the runbook, section 8.

## 7. Closing G-134

Close the gap only when all of these are recorded:

- The pinned fingerprint and the commit the connector ran.
- Who confirmed it, the date, and the channel.
- The doctor output after pinning.
- The result of the wrong-value test, or "not run" with the reason.
- The deployment name and date.

Then update the gap register entry, the audit file, `REMAINING-WORK.md`, `STATUS.md` and the index in parmana-core, and the copies in parmana-docs.

## 8. Related items

- parmana-connectors `docs/G-128-G-129-credential-and-bypass.md` already says to pin the key once confirmed. Nothing to change.
- The `parmana-core` script `scripts/generate-external-release-fixtures.ts` comment says the connector pins in production. This is now true while release-only is on.

## 9. Open items

1. Owner decision: the production fingerprint, confirmed through a second channel.
2. Operator pins it on the deployed connector.
3. Run `npm run doctor` and a service start on Node 24, and record the result.
4. Live run against a deployed connector.
5. Merge `claude/format-readme-doctor` with `claude/g-134-pin-connector-key`, or reapply the formatting on the G-134 branch.
6. Decide whether to open pull requests for the branches above.
