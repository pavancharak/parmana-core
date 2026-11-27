# Owner records

G8 needs three records from the repository owner before a release passes:
`deployment-verification.json`, `backup-recovery-drill.json` and
`runtime-infrastructure-review.json`. Automated checks cannot establish these.

Each record is a JSON file, committed through a reviewed pull request. The gate
reads records from the trusted base branch, so a record counts only after it is
merged. Copy `template.json` and fill it in.

| Field             | Rule                                                                            |
| ----------------- | ------------------------------------------------------------------------------- |
| `record`          | Must equal the file name without `.json`.                                       |
| `approver`        | Named owner. Must not be empty.                                                 |
| `approved_on`     | `YYYY-MM-DD`. Must not be in the future.                                        |
| `expires_on`      | `YYYY-MM-DD`. The gate fails after this date, so records are renewed regularly. |
| `summary`         | What was checked and the result.                                                |
| `evidence_url`    | Link to the drill log, runbook run or review notes.                             |
| `release_version` | The version this record covers.                                                 |
