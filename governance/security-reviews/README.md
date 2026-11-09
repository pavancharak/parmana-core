# Security review: summary and open items

Source: the `pavancharak/findings` repository, at commit `1eb89b3`. The three files next to this one are copied from it unchanged:

- `FINAL-REPORT.md`: the final report and the status of each finding.
- `FINDINGS.md`: the chronological record, updates 1 to 42.
- `FINDINGS-2.md`: updates 43 to 46, kept separately so the first file matches `main` as it was.

The RFC draft that came out of the review is `docs/internal/rfcs/RFC-0024-revision-DRAFT.md`.

These are raw review logs. They are kept as written, so this folder is excluded from Prettier (`.prettierignore`), and the documentation sync does not copy it.

## Status at update 46

The review covers `parmana-core`, `parmana-connectors`, `parmana-verifier` and `parmana-connect`. The verifier and connect were read in part only.

### Fixed and merged

- **F1** (incident runbook queries the wrong table): fixed in `parmana-connectors`.
- **F2** (release ledger had no tests): tests added and merged.
- **F3** (replay identity keyed on the transaction ID only): resolved in `parmana-core`.
- **F4** (replay integration test skipped without a database): now run and passing.
- **F6** (distrusted-root list and startup guard): narrowed to G3, and the guard reports rather than refusing when no root matches. Merged.
- **F28-1 to F28-3** (`parmana-connectors` release path): fixed and merged.
- **F28-5** (external connector identity disagreed between Core and Connectors): closed in production.
- **F28-7** (business conditions): merged across both repositories. The evaluator for `razorpay:refund` is on `main`, and it is registered at startup. Core reads the condition evidence, binds it into the signed record, refuses evidence with credential-shaped key names, and has an end-to-end test that a failed condition stops the refund.

### Open in `parmana-core`

- Confirm the CI run on `main` for merge commit `3bbd4c9` finishes green. At update 46 its test step was still running.
- A full Trust Record test in the runtime package. Not started.
- The example endpoint does not yet send `conditionsChecked`.

### Open in other repositories (not fixable from `parmana-core`)

- **F28-6** (`parmana-connect`): its signed-release path omits `target` and the business transaction ID, so the Razorpay adapter refuses those releases.
- **F28-4** (target binding): the generic connector and Paytm refunds do not check the signed target.
- **F26-5 and F26-8** (Paytm): the refund ID behaviour and the endpoint paths are unverified. Live Paytm refunds must stay off until they are.
- **F26-6 and F26-7** (design notes): Zoho create has no connector-level duplicate check, and Zerodha paper orders are not guarded.
- **End-to-end test across services**: no test yet sends a Core-signed release through the connectors service and checks the resulting Trust Record.
- **eMudhra roots**: Chrome and Mozilla were still evaluating the remaining roots. This matters only if one of them is added to the distrusted list.
- **Review coverage**: the connector adapters, `parmana-verifier` and `parmana-connect` need a further security review.
