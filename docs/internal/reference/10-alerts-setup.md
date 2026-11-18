# Alerts setup

**Status:** reference draft. The channel choice is an **OWNER DECISION** (see the question at the end).

## What is configured

| Setting                           | Required for                | Notes                                              |
| --------------------------------- | --------------------------- | -------------------------------------------------- |
| `PARMANA_POLICY_V2_SMTP_URL`      | Email alerts                | SMTP connection URL. Store it in the secret store. |
| `PARMANA_POLICY_V2_EMAIL_FROM`    | Email alerts                | The sender address.                                |
| `PARMANA_POLICY_V2_SNS_EVENTS`    | SES bounce reports          | `true` turns on the Amazon SNS endpoint.           |
| `PARMANA_POLICY_V2_EVENTS_SECRET` | The neutral events endpoint | Set only if the endpoint is needed.                |
| `PARMANA_POLICY_V2_SWEEP_SECONDS` | How often sweeps run        | Unset uses the default.                            |

Without the SMTP settings, alerts show on the console only.

## Who receives alerts

Set contacts with `POST /contacts` for each person who should receive alerts. Record the contact's name and role here, not their address.

| Person            | Role         | Receives                      |
| ----------------- | ------------ | ----------------------------- |
| Mohinder          | Action owner | All alerts for both actions   |
| Pavan             | Successor    | All alerts for both actions   |
| Asha, Mamta       | Gate owners  | Go-live and escalation alerts |
| Shalini, Mahendra | Reviewers    | Review queue alerts           |

## Alerts that cannot be dismissed

Alerts that need action escalate from the named backup to the Parmana owner, then to Operations (policy version 2 guide). Check the escalation path before enabling a capability.

## Testing alerts

1. In staging, send one test alert to each contact.
2. Confirm each contact received it. Record the date.
3. Confirm a bounce, if one happens, shows on the console.

## Owner question

Email alerts (SMTP), SES bounce reports, or the console only, for the first capability?
