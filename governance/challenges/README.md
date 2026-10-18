# Challenge Records

Each file here is one Challenge Record ([RFC-0022](../../docs/rfcs/RFC-0022-Challenge-Record.md)):
a claim or assumption someone questioned, what was checked, what was found and what changed.
The file is the public copy. The same record is written to the `challenge_records` table with:

```bash
npx tsx scripts/record-challenge.ts governance/challenges/<id>.json --dry-run
npx tsx scripts/record-challenge.ts governance/challenges/<id>.json
```

`DATABASE_URL` is read from the shell or `.env`, and the first line printed names the
database. The script never overwrites a record that already exists.

Records are append only. A file is not edited after it is written to the database; a
correction is a new record whose `supersedes` names the old one.

Records CR-2026-07-001 to CR-2026-08-003 were written on 2026-10-10 for challenges handled
before Challenge Records existed. Their sources (`04-INCIDENTS-LOG.md`,
`docs/VERIFICATION-GAPS.md`, RFC-0021, RFC-0022 and `docs/CLAIMS.md`) stay authoritative; each
record cites them. Where a source gives no exact date, the record uses the latest date the
sources support and says so.

| Record                                | Claim challenged                                                    | Source               | Finding             |
| ------------------------------------- | ------------------------------------------------------------------- | -------------------- | ------------------- |
| [CR-2026-07-001](CR-2026-07-001.json) | Signatures by the default key are authentic (exposed key, INC-1)    | self-identified      | confirmed           |
| [CR-2026-08-001](CR-2026-08-001.json) | No unauthorized execution (signals not bound to the Intent, G-24)   | adversarial exercise | confirmed           |
| [CR-2026-08-002](CR-2026-08-002.json) | Refusals leave evidence (RFC-0021)                                  | public comment       | confirmed           |
| [CR-2026-08-003](CR-2026-08-003.json) | Challenges are recorded as checkably as runtime outcomes (RFC-0022) | public comment       | confirmed           |
| [CR-2026-10-001](CR-2026-10-001.json) | "No AI agent can execute without a signed human approval, ever"     | public comment       | partially-confirmed |
