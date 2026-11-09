# G-143 implementation: who approved an inbound decision, and when

Status: implemented on branch `feat/g143-approval-record`, not yet merged. Gap: G-143 in
`docs/internal/VERIFICATION-GAPS.md`. Parent: G-129 (issue #421). Design: `docs/internal/designs/G-143-G-144-design.md`.

## 1. What the gap was

An inbound decision (`POST /v1/inbound/checks`) could be approved on a human approval, but its record did not say
who approved, with which key, which approval, or when. An auditor could not tell whether a person had approved the
request. Approvals were also consumed during the decision, before the decision was recorded, so a failed write lost
the approval.

## 2. Decisions this implements

| Decision                                                                | Source                                    | Status                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| The four approval fields are signed with the record                     | Design, G1                                | Implemented                                             |
| The key ID is recorded as well as the approver                          | Design, G2                                | Implemented                                             |
| An approval is single-use, tied to its nonce                            | Design, G3                                | Already enforced; now also written with the decision    |
| The approval is consumed in the same transaction as the decision record | Design, O1 (owner decision, "go with O1") | Implemented                                             |
| A decision that used several approvals records no approval fields       | Design, O3                                | Open. Every approval is consumed; no fields are written |

## 3. The four fields

| Field           | Source                               | When present                                              |
| --------------- | ------------------------------------ | --------------------------------------------------------- |
| `approvedBy`    | `approval.payload.issuer.approverId` | Approved decision that used exactly one verified approval |
| `approvedKeyId` | `approval.payload.issuer.keyId`      | Same                                                      |
| `approvalId`    | `approval.payload.approvalId`        | Same                                                      |
| `approvedAt`    | `approval.payload.issuedAt`          | Same                                                      |

The values come only from the verified approval. A partner who sends these names in the request has them ignored.
They are part of the signed bytes, so changing any of them breaks the signature.

## 4. How a request flows now

1. The route checks the grant limits, then calls `decideInbound`.
2. `decideInbound` runs the decision with `deferApprovalConsumption: true`. The approval is verified in full, and its
   nonce is **not** consumed at this point.
3. The decision reports the approvals it accepted: approval ID, approver, key, issued time, nonce, and nonce expiry.
4. If the final outcome is approved, the route writes the decision and consumes every approval it used:
   - **Postgres:** one transaction. Each nonce is inserted into `consumed_approval_nonces`, then the decision row is
     inserted. A unique violation on a nonce (a repeat use) rolls the whole transaction back and raises
     `ApprovalAlreadyUsedError`.
   - **Memory:** the same check and write in one synchronous step.
5. On a repeat use, nothing is consumed and nothing is recorded as approved. The request is recorded as **refused**,
   with reason `approval_already_used`, and no approval fields. The response is still 201, as for any refusal.
6. If a decision used an approval but the store has no way to consume it, the route fails closed (HTTP 500). It never
   writes an approval that was not consumed.

The execute path is unchanged. `decide()` still consumes approvals at the authorize stage by default, as before.

## 5. Changes by package

| Package                            | Change                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/policy`                  | `SignalStateVerificationRequest` gains optional `usedApprovals` (a collector) and `deferApprovalConsumption`. `UsedApproval` gains `nonce` and `expiresAt`. Both additions are optional, so existing verifiers are unaffected. |
| `packages/approval`                | `ApprovalSignalVerifier` reports each approval it accepts to the collector, and honours the deferral flag. A refused approval is not reported.                                                                                 |
| `packages/runtime`                 | `decide()` takes optional `DecideOptions`. `decideInbound` passes the deferral. `decide()` returns the approvals it used.                                                                                                      |
| `packages/shared`                  | `InboundCheckRecord` gains the four optional fields. `ConsumedApprovalNonce` and `ApprovalAlreadyUsedError` are added. `InboundCheckRepository` gains `appendConsumingApprovals`.                                              |
| `packages/storage`                 | Memory repository: consume-and-write in one step. Supabase repository: consume-and-write in one transaction. Reads and writes the four fields.                                                                                 |
| `packages/api`                     | The route records the fields, consumes approvals with the record, handles the repeat-use refusal, and fails closed. `app.ts` wires the new store method and maps the approvals.                                                |
| `supabase/migrations`              | `20261108170000_add_inbound_approval_identity.sql` adds `approval_id` and `approved_key_id`. `approved_by` and `approved_at` already existed.                                                                                  |
| `scripts/apply-all-migrations.sql` | Regenerated with `npm run generate:migration-bundle`.                                                                                                                                                                          |

## 6. Compatibility

- **Existing records** have none of the four fields. Their signed bytes are unchanged, because the signed bytes include
  only the fields present on a record. They still verify.
- **New records** that carry approval fields have different signed bytes. No verifier outside `parmana-core` reads
  inbound records today. `parmana-verifier` reads Execution Trust Records only, and this repo has no inbound signature
  check. A future external consumer of inbound records must read these fields. Whether one is needed is an owner
  decision (section 8).
- **Requests with no approval** are unaffected.
- **The database** needs migration `20261108170000` applied before the new code runs. Without it, the Postgres insert
  fails, and the request fails with a 500 rather than recording an incomplete decision.

## 7. Tests

| Test                                                                                                                      | Where                                                                                       | What it proves                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Route records and signs the four fields                                                                                   | `packages/api/tests/unit/routes/inbound-checks-approval.test.ts`                            | The fields are written and covered by the signature |
| Changing a field breaks the signature                                                                                     | Same file                                                                                   | The fields are signed                               |
| No fields with no approval                                                                                                | Same file                                                                                   | Requests without approval are unchanged             |
| No fields when rejected, even with an approval                                                                            | Same file                                                                                   | Only approved decisions carry approval fields       |
| No fields with several approvals (O3)                                                                                     | Same file                                                                                   | The documented limit                                |
| A partner-declared approver is ignored                                                                                    | Same file                                                                                   | The fields come only from the verified approval     |
| Consumption is written with the decision                                                                                  | Same file                                                                                   | The route calls the consume-and-write method        |
| A repeat use is refused, recorded as refused, nothing consumed                                                            | Same file                                                                                   | The refusal path                                    |
| Fails closed without a consuming store                                                                                    | Same file                                                                                   | No unconsumed approval can be written               |
| Verifier reports approver, key, approval, time, nonce, expiry                                                             | `packages/approval/tests/unit/used-approvals.test.ts`                                       | The collector is correct                            |
| Refused approval is not reported                                                                                          | Same file                                                                                   | Only accepted approvals are reported                |
| Deferred approval is not consumed; execute path still consumes                                                            | Same file                                                                                   | The deferral does what it says                      |
| Memory: consume and write; second use refused with no record; batch all-or-nothing                                        | `packages/storage/tests/unit/memory-inbound-check-consumption.test.ts`                      | Atomicity in memory                                 |
| Postgres: record and consume; second use refused; batch all-or-nothing; a failed record insert rolls back the consumption | `packages/storage/tests/integration/supabase-inbound-check-consumption.integration.test.ts` | Atomicity in the database                           |

Results at the time of writing:

- Typecheck, lint, format check and build pass.
- Unit and architecture suites for runtime, API, approval, policy, storage: 2,102 tests pass, 3 skipped.
- The Postgres integration test passes: 4 of 4, run against a local PostgreSQL 16 server.

### Running the Postgres test

The test is skipped unless `TEST_DATABASE_URL` is set. It refuses to run if that URL equals `DATABASE_URL`.

```bash
TEST_DATABASE_URL="postgresql://<user>@<host>:<port>/<test database>" \
  npx vitest run packages/storage/tests/integration/supabase-inbound-check-consumption.integration.test.ts
```

The test runs against a database where the real migrations have been applied, using the bundle
`scripts/apply-all-migrations.sql`. Every row it writes carries a run tag and is deleted afterwards.

To prepare such a database: create an empty database, then run the bundle against it with `psql -f scripts/apply-all-migrations.sql`.
Running it on Supabase works without changes. On a plain PostgreSQL server, it reports "role anon does not exist" for two
Supabase grants; those errors are harmless for this test.

The test was run this way against a local PostgreSQL 16 server, with the bundle applied: 4 of 4 pass, and no test rows
remain afterwards.

## 8. Still open

- **O3, several approvals on one decision.** Every approval is consumed, but no approval fields are written. A child
  table, one row per approval, is the planned fix (design section 5).
- **Nonce cleanup.** `consumed_approval_nonces` grows with every approval used. Rows past their `expires_at` can be
  removed. No cleanup job exists yet.
- **External consumer.** No consumer of inbound records exists outside `parmana-core`. Whether one is needed is an owner
  decision. If it is, it is a new feature with its own design, not an update to `parmana-verifier`.
- **Migration against Supabase.** The migration has been applied to a local PostgreSQL 16 database, through the real
  bundle, and the integration test passes against it. It has not been applied to a Supabase project.
- **Claims and gap record.** `CLAIMS.md` and `VERIFICATION-GAPS.md` are not yet updated. G-143 should stay open until
  O3, the external verifier, and the migration are done.

## 9. Order to finish

1. Apply `20261108170000` to the staging database (through the bundle). Run the integration test against it.
2. Decide whether an external consumer of inbound records is needed. If yes, design it as a new feature.
3. Decide O3. If several approvals are in scope, build the child table before any production use.
4. Add nonce cleanup.
5. Update the claim (3.31) and the gap record, then close G-143.
