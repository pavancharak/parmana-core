# Staging test report: `crm:read`, then `erp:invoice-pay`

**Status:** template. Fill in after each staging run. Do not record results that were not observed.

## Run details

- **Deployment:** staging
- **Capability:**
- **Policy version and hash:**
- **Settings used** (names only; no values): `PARMANA_POLICY_V2_DECISIONS`, `PARMANA_POLICY_V2_CAPABILITIES`, database, alert channels
- **Tester:**
- **Date and time (UTC):**
- **Commit of the server:**

## Cases

| #   | Case                                         | Expected                          | Observed | Pass/fail | Evidence reference |
| --- | -------------------------------------------- | --------------------------------- | -------- | --------- | ------------------ |
| 1   | Allowed request                              | `APPROVE`, `released: false`      |          |           |                    |
| 2   | Refused request (not the account owner)      | refusal names the rule            |          |           |                    |
| 3   | Capability not in allowlist                  | HTTP 404, `not_enabled`           |          |           |                    |
| 4   | Policy not approved                          | `NO_APPROVED_POLICY`              |          |           |                    |
| 5   | (`erp:invoice-pay` only) source answer valid | value used                        |          |           |                    |
| 6   | (`erp:invoice-pay` only) expired answer      | `SOURCE_UNAVAILABLE` or `EXPIRED` |          |           |                    |
| 7   | (`erp:invoice-pay` only) replayed nonce      | `REPLAYED`                        |          |           |                    |

## Open items

- None recorded until the run is done.

## Sign-off

| Name | Role         | Date |
| ---- | ------------ | ---- |
|      | Tester       |      |
|      | Action owner |      |
