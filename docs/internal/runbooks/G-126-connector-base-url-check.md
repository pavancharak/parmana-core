# G-126: connector base URLs in production

**Status: open.** The code fix is merged. The gap stays open until the deployment check below is done and its result is recorded in [../VERIFICATION-GAPS.md](../VERIFICATION-GAPS.md).

## The problem

`readConnectorBaseUrl` (`packages/api/src/bootstrap/readConnectorBaseUrl.ts`) reads three operator-set variables: `HUBSPOT_BASE_URL`, `GITHUB_BASE_URL` and `SLACK_BASE_URL`. Before the fix it accepted a loopback address (`http://localhost`, `http://127.0.0.1` or `http://[::1]`) in every environment. If a production deployment set one of these to a loopback `http://` address, the connector credential (a bearer token or an App key) would be sent in clear text to that address.

The exposure was limited. The variables are set by the operator in the environment, not by an agent, so an agent cannot trigger it. The Paytm connector was already HTTPS-only outside tests.

## What is fixed

- **Code:** commit `2b00dc5`, merged to `main` in PR #169 on 2026-10-28.
- **Behaviour now:** the loopback `http://` exception applies only when `NODE_ENV` is `test`, where the hermetic mock-server seams run. Anywhere else, these variables must use `https://`.
- **Tests:** `packages/api/tests/unit/bootstrap/read-connector-base-url.test.ts` (six cases). The three connector integration suites that use these seams still pass.
- **Claim:** CLAIMS 3.26, item 1.

## What is still open

The code cannot tell whether a live deployment sets one of these variables to a loopback address. That is a fact about the environments, so someone with access must check it.

The gap stays open until both environments are checked and the result is recorded.

## The check

Do this for each environment:

- **Hosted (Vercel):** the production environment of the Vercel project.
- **Self-hosted:** every self-hosted deployment, from the environment file or secret store that the deployment reads.

For each of `HUBSPOT_BASE_URL`, `GITHUB_BASE_URL` and `SLACK_BASE_URL`, record one of these:

- **Unset:** the variable is not defined.
- **HTTPS:** the value starts with `https://`.
- **Fails:** the value is `http://` or a non-loopback address that does not use HTTPS. Stop and report it at once, because the credential may already have been sent in clear text.

### Vercel

1. Open the project in the Vercel dashboard and go to **Settings → Environment Variables**.
2. Select the **Production** environment.
3. Find each of the three variables. Note whether it is absent, or whether its value starts with `https://`.

Or, from a terminal signed in to Vercel:

```bash
vercel env ls production
```

This lists the variable names. To read values, pull them to a file, check them, and delete the file straight away, since it holds secrets:

```bash
vercel env pull .env.production.check --environment production
```

Do not paste values into tickets, chat or the repository. Record only the status: unset, HTTPS, or fails.

### Self-hosted

For each self-hosted deployment, read the environment file or secret store the deployment uses, and record the same three statuses. Use the same rules, and do not copy values out.

## Record template

Add this to the G-126 entry in `VERIFICATION-GAPS.md`, one row per environment:

| Date       | Environment       | HUBSPOT_BASE_URL      | GITHUB_BASE_URL       | SLACK_BASE_URL        | Checked by |
| ---------- | ----------------- | --------------------- | --------------------- | --------------------- | ---------- |
| YYYY-MM-DD | Vercel production | unset / HTTPS / fails | unset / HTTPS / fails | unset / HTTPS / fails | name       |

## Closing the gap

The gap closes when:

1. Every environment in use has a row in the table above.
2. No row says "fails", or any "fails" has been fixed and re-checked.
3. The G-126 entry in `VERIFICATION-GAPS.md` says "closed" and gives the date and the rows.

Until then, the status stays "open", and the register must not describe the gap as closed.
