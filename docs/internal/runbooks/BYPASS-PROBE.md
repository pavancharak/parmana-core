# No-bypass probe runbook

Gap G-146, part of G-129. Decision: RFC-0024, decision 6.

## What the probe checks

A business system is protected against direct agent calls only if it refuses a request that carries no Parmana
approval. The probe sends such a request to one business-system route, and records what the route answered.

- **refused**: the route answered 401 or 403. Protection held for that route, for that request.
- **bypass**: the route accepted the request (any 2xx or 3xx). The probe raises an alert, and the scheduled run fails.
- **not_verified**: no answer, a redirect, or any other status (for example 404 or 500). The probe does **not** say the
  route is protected.

A `refused` result is evidence for one route on one request. It is not proof that every path to the system is closed.

## What the probe does not do

- It sends no credential and no approval. It is a request a direct caller would make.
- It never follows a redirect, and it only sends to `https://` addresses.
- It does not test other routes, other methods, or other agents. Each protected route needs its own target.

## Setup

The workflow is `.github/workflows/bypass-probe.yml`. It runs every six hours and can be started by hand.

| Name                           | Kind     | Purpose                                                                                |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------- |
| `BYPASS_PROBE_TARGET_URL`      | Secret   | The `https://` route to test. Until this is set, every run does nothing and says so    |
| `BYPASS_PROBE_SIGNING_KEY_PEM` | Secret   | An Ed25519 private key, PEM, that signs each record. Keep it out of chat and documents |
| `BYPASS_PROBE_TARGET_NAME`     | Variable | A short name for the route, shown in records and alerts                                |
| `BYPASS_PROBE_METHOD`          | Variable | `GET` or `POST`. Defaults to `GET`                                                     |

The business-system owner names the route. The route must refuse a request with no approval, with a 401 or 403. If it
does not, the probe will report a bypass on the first run, which is the point of the probe.

## Reading a result

The run prints the signed record as JSON. Its fields are `probeId`, `targetName`, `targetUrl`, `probedAt`, `outcome`,
`status`, `reason`, and `signature`.

| Exit code | Meaning                                                                          | What to do                                                                             |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 0         | Nothing is configured, or the route refused the request                          | Nothing, for a refusal. For "nothing configured", set the secret when a route is ready |
| 1         | A configuration error, or the probe could not verify protection (`not_verified`) | Fix the configuration, or find out why the route answered as it did                    |
| 2         | **Bypass**: the route accepted a request with no approval                        | Treat as an incident. See below                                                        |

To check a record's signature, verify the `signature` (base64) over the canonical bytes of the record, which is the JSON
of every field except `signature`, with keys sorted at the top level, against the public key that matches
`BYPASS_PROBE_SIGNING_KEY_PEM`. The record format is defined in `packages/api/src/inbound/bypass-probe.ts`
(`canonicalProbeBytes`).

## If the probe reports a bypass

1. Stop treating the route as protected. Tell the business-system owner the time and the target name.
2. Find out how the request got through. Check whether the route accepts requests without a decision, and whether a
   change made it accept them.
3. Keep the signed record. It is the evidence of what happened and when.
4. Re-run the probe after the fix. Only a `refused` result from a later run shows the route refuses again.

## Limits

- The probe runs every six hours, so a bypass can go unseen for up to that long. Run it by hand after a change to a
  protected route.
- A probe result belongs to the time it ran. It says nothing about later changes.
- No business system is configured as a target yet, so the probe has not yet run against a real route.

## Where it lives

- Probe: `packages/api/src/inbound/bypass-probe.ts`
- Environment reader and runner: `packages/api/src/inbound/bypassProbeFromEnv.ts`
- Script: `scripts/run-bypass-probe.ts`
- Tests: `packages/api/tests/unit/inbound/bypassProbeFromEnv.test.ts`, and `packages/api/tests/unit/inbound/bypass-probe.test.ts`
