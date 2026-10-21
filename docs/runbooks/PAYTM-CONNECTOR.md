# Paytm connector runbook

How the Paytm refund connector is configured in production, what the startup checks refuse, and how to rotate its shared secret. Written from `packages/api/src/bootstrap/assertPaytmConnectorConfigured.ts`, `createPaytmConnector.ts`, `createPaytmCredentialProvider.ts` and `createConnectorRegistry.ts`.

**Read first:** [README.md](README.md) for the rules that apply to every runbook.

---

## 1. What it is

The Paytm connector lets Parmana release a refund (`PAYTM_REFUND_CAPABILITY`) to a separate Paytm connector service. Parmana does not call Paytm directly. It calls the connector service at `PAYTM_CONNECTOR_URL`, authenticated with `PAYTM_CONNECTOR_SHARED_SECRET`.

The connector is optional. When neither variable is set, the connector is not registered, and no Paytm capability is available. This is deliberate: a deployment without Paytm should not have a Paytm route.

---

## 2. Variables

| Variable | Required | Rules |
|---|---|---|
| `PAYTM_CONNECTOR_URL` | With the secret | Must start with `https://` in production. Refused otherwise. |
| `PAYTM_CONNECTOR_SHARED_SECRET` | With the URL | Non-empty. Read from the environment. Its value never appears in an error message; only the variable name does. |
| `PAYTM_CONNECTOR_TIMEOUT_MS` | No | A positive number of milliseconds. Refused if not a positive finite number. Set it only if the default is too short for your connector. |

**Both or neither.** Set exactly one, and the server refuses to start, with a message that says which of the two is set.

---

## 3. What the startup checks refuse

Each check runs before the port is opened. Read the message; it names the variable.

| Message contains | Cause | Fix |
|---|---|---|
| `Partial Paytm connector configuration detected` | One of the two variables is set, the other is not | Set both, or remove both |
| `PAYTM_CONNECTOR_URL must use HTTPS in production` | The URL starts with `http://` | Use the `https://` URL of the connector service |
| `PAYTM_CONNECTOR_TIMEOUT_MS must be a positive number` | The timeout is zero, negative or not a number | Set a positive number of milliseconds, or remove it |
| `Environment variable PAYTM_CONNECTOR_SHARED_SECRET ... is not set` | The provider was asked for the secret but it is empty | Set the secret, then redeploy |
| `createPaytmConnector() was called with PAYTM_CONNECTOR_URL unset` | The secret is set, the URL is not | Set the URL, or remove the secret |

For a message that comes from the Vercel deployment, read it in the Runtime Logs (see [PRODUCTION-DEPLOY-AND-ROLLBACK.md](PRODUCTION-DEPLOY-AND-ROLLBACK.md), section 5). Changing a value needs a redeploy ([PRODUCTION-ENVIRONMENT.md](PRODUCTION-ENVIRONMENT.md), section 9).

---

## 4. Check the connector is registered

After a successful start, the Paytm connector is registered only if both variables are set. If the refund capability is missing from the connector list, check the two variables first. The connector service is separate from this repository, so check its health separately.

---

## 5. Rotate the shared secret

The connector service and Parmana must agree on the secret. Changing it on one side only makes every refund fail to authenticate.

1. Generate the new secret, and save it in the password manager.
2. Set it on the connector service, following that service's own runbook, and confirm the service accepts the new value.
3. Set `PAYTM_CONNECTOR_SHARED_SECRET` on Vercel:
   ```powershell
   $link = "$env:USERPROFILE\parmana-vercel-link"
   vercel env rm PAYTM_CONNECTOR_SHARED_SECRET production --yes --cwd $link
   $secret = [System.Net.NetworkCredential]::new("", (Read-Host "New Paytm connector secret" -AsSecureString)).Password.Trim()
   $secret | vercel env add PAYTM_CONNECTOR_SHARED_SECRET production --sensitive --cwd $link
   Remove-Variable secret
   ```
4. Redeploy Parmana (changes apply only to new deployments).
5. Confirm with a refund of a small amount in a test environment, not production, if one exists.

**Order:** if you change the Parmana side first, refunds fail until the connector is updated. If you change the connector first, refunds fail until Parmana is redeployed. Plan a short window either way.

---

## 6. Test mode

`NODE_ENV=test` skips these checks. The credential provider then uses a placeholder secret, or `TEST_PAYTM_CONNECTOR_SHARED_SECRET` if set. Tests use a mock connector server; no test should point at the real connector service.

Never set `NODE_ENV=test` in production (see [PRODUCTION-ENVIRONMENT.md](PRODUCTION-ENVIRONMENT.md), section 5).

---

## 7. Common mistakes

- **Setting only the URL.** Refused at startup. The connector would be registered with no way to authenticate.
- **An `http://` URL for a local test connector in production.** Refused at startup. Use a local test setup instead ([LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md)).
- **Pasting the secret into the URL or a log.** The secret is read from its own variable. Keep it out of every other value.
