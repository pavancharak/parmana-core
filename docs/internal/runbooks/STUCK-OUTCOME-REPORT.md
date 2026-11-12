# Running the stuck-outcome report on a schedule

Status: runbook. The report is built (`scripts/report-stuck-outcomes.ts`, `npm run report:stuck-outcomes`, #592). This runbook sets it up on a host. It does not change any row: the report only reads.

## What it reports

Rows still `in_flight` whose authorization has expired. Each one may have reached a connector and may need a person to check the external system. A non-empty report means a person should look. An empty one means nothing is waiting.

## Set-up

1. Put the connection string in the repository's `.env` file, as `DATABASE_URL=...`, following `docs/internal/runbooks/ENV-FILE.md`. The script loads `.env` through `dotenv`. Do not put the connection string on the command line, in the scheduler entry, or in the repository.
2. Confirm the report runs by hand from the repository root:

   ```bash
   npm run report:stuck-outcomes
   ```

   It should print `No stuck in-flight outcomes.` or a table of rows. Exit code 0 means the report was produced. Exit code 1 means it failed, and the cause is printed on stderr.

3. Schedule it. Daily is enough: a row only becomes reportable after its authorization expires.

## Linux (cron)

Add to the crontab of the account that owns the repository (`crontab -e`). This runs at 06:15 each day and appends the output to a log:

```bash
15 6 * * * cd /srv/parmana-core && /usr/bin/env npm run report:stuck-outcomes >> /var/log/parmana/stuck-outcomes.log 2>&1
```

Create the log directory first, owned by that account: `sudo mkdir -p /var/log/parmana`.

## Windows (Task Scheduler)

1. Open Task Scheduler and choose **Create Task**.
2. **General:** name it `Parmana stuck-outcome report`. Run it under the account that owns the repository.
3. **Triggers:** daily, at 06:15.
4. **Actions:** start a program `cmd.exe`, with arguments:

   ```
   /c cd /d D:\last\parmana-core && npm run report:stuck-outcomes >> D:\last\parmana-core\logs\stuck-outcomes.log 2>&1
   ```

   Create the `logs` folder first.

## Reading the result

- The log gets one block per run, with the time it ran.
- A run that lists rows is the signal to act: check each row's external system, then resolve it by hand. The report does not resolve anything.
- Exit code 1 means the report failed. A failed run must not be read as "nothing stuck". Check the error in the log.

## What this does not cover

- Resolving a stuck row. That is a person's decision, after checking the external system. The reconciler's resolution stage is not built.
- Alerting. The log is the record. Connecting it to an alert is a separate decision.
