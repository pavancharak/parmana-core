# Operator CLI: `@parmana/cli` (`parmana-ops`)

[SDKs](README.md) · [Maker-checker tutorial](../tutorials/maker-checker.md) · [Policy management](../policies/README.md)

`parmana-ops` is the operator's command-line tool. It proposes policy changes from a file, signs a checker's step-up envelope on the checker's own machine, submits it, creates caller keys, and generates approver keys. It is the recommended route for a policy change in a real deployment, because the signing key never has to leave the checker's machine.

|         |                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Package | `@parmana/cli` (npm, 4.1.1)                                                                                                            |
| Binary  | `parmana-ops`                                                                                                                          |
| Status  | **Implemented.** Known defect in how the installed binary starts. See [Known issue](#known-issue-the-installed-binary-prints-nothing). |

## Install

```bash
npm install -g @parmana/cli@4.1.1
```

## Known issue: the installed binary prints nothing

When you run the installed `parmana-ops`, it exits with code 0 and prints nothing. The command does nothing. The cause is in the entry-point check at the end of `packages/cli/src/index.ts`:

```typescript
if (/[\\/](index\.js|parmana)$/.test(process.argv[1] ?? "")) {
```

The check runs `main()` only when the script's path ends in `index.js` or `parmana`. When npm starts the command through its bin name (`parmana-ops`), the path ends in `parmana-ops`, the check fails, and `main()` never runs. The verification reproduced this: `node <bin path>/parmana-ops --help` printed nothing, and `node <package>/dist/index.js --help` printed the usage.

This was not changed, because the published package's behaviour is outside the scope of this portal. Until it is fixed, run the command through the file itself:

```bash
CLI="$(npm root -g)/@parmana/cli/dist/index.js"
node "$CLI" --help
node "$CLI" policy status vendor-payment 2.1.1
```

Or, from a repository checkout: `node packages/cli/dist/index.js --help`. Once fixed upstream, the plain `parmana-ops` command will work and this section can be removed.

## Global options and environment

| Option or variable                     | Meaning                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `--output text\|json`                  | Output format. Default `text`.                                    |
| `--profile <name>` / `PARMANA_PROFILE` | A named API address from the config file.                         |
| `--api-url <url>` / `PARMANA_API_URL`  | The API address. The flag overrides the variable and the profile. |
| `--dry-run`                            | Print the request without sending it.                             |
| `--verbose`                            | Log each request and response code, with secrets removed.         |
| `--timeout <seconds>`                  | Per-request timeout. Default 30.                                  |
| `PARMANA_TOKEN`                        | The caller's bearer token. Read from the environment only.        |
| `PARMANA_CONFIG`                       | Path to the config file.                                          |

Use `PARMANA_TOKEN` for the token. Do not pass it as a flag, because flags end up in shell history.

## Commands

| Command                                                                                                                                                                      | Purpose                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy propose <policy.json> --name <n> --version <v> --reason "<why>"`                                                                                                     | Propose a policy change. The file's `policyId` and `policyVersion` must match `--name` and `--version`.                                     |
| `policy status <name> <version>`                                                                                                                                             | List the pending changes for one policy version. Approved and rejected changes are not listed.                                              |
| `approval sign --key-file <private.pem> --key-id <id> --pending <id> --action <approve\|reject> [--out <file>]`                                                              | Sign a step-up envelope locally. Nothing is sent. The envelope expires 120 seconds after signing.                                           |
| `approval submit --pending <id> --action <approve\|reject> --envelope <file>`                                                                                                | Send a signed envelope with the checker's own token.                                                                                        |
| `approver list`, `approver propose-add`, `approver propose-revoke`, `approver submit`                                                                                        | Manage approver keys through approval-issuer changes.                                                                                       |
| `keys generate-api-key --caller-id <id> --out-dir <dir> [--allowed-capabilities a,b] [--allowed-principal-ids a,b] [--credential-holder-type USER] [--generate-step-up-key]` | Generate a caller's raw key, its `PARMANA_API_KEYS` entry, and optionally a step-up key pair. Writes owner-only files and prints no secret. |
| `keys generate-approver-key`                                                                                                                                                 | Generate an approver's Ed25519 key pair. The private key stays with the approver.                                                           |
| `log verify`, `log export`, `log check-db`                                                                                                                                   | Check and export the approval log.                                                                                                          |
| `completion`                                                                                                                                                                 | Print a shell completion script.                                                                                                            |

`--generate-step-up-key` requires `--credential-holder-type USER`.

## The maker-checker flow with the CLI

This was run against a local server for this portal, using the repository build of the CLI (`packages/cli/dist/index.js`) in place of the bin name, for the reason above:

```bash
export PARMANA_API_URL=http://localhost:3000
CLI=packages/cli/dist/index.js

# 1. The maker proposes a version from a file.
PARMANA_TOKEN="$MAKER_KEY" node $CLI policy propose vendor-payment-2.1.1.json \
  --name vendor-payment --version 2.1.1 --reason "Limit change"
# -> pendingPolicyChangeId: <id>

# 2. The maker tries to approve (refused, as it must be).
PARMANA_TOKEN="$MAKER_KEY" node $CLI approval submit --pending <id> --action approve --envelope envelope.json
# -> HTTP 403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE

# 3. The checker signs the envelope locally, then submits it with their own token.
node $CLI approval sign --key-file checker-stepup.private.pem --key-id checker-step-up-key \
  --pending <id> --action approve --out envelope.json
PARMANA_TOKEN="$CHECKER_KEY" node $CLI approval submit --pending <id> --action approve --envelope envelope.json
# -> the change is returned; the policy version is now in effect for execution
```

Keep `$MAKER_KEY` and `$CHECKER_KEY` in your shell only for the commands that need them, and in a secret store otherwise. Never commit the step-up private key.

## Verified behaviour

| Step                           | Result                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `policy propose` from a file   | Returned the pending change id and the proposed content.                                                              |
| `approval sign`                | Wrote the envelope and reported that it expires 120 seconds after signing.                                            |
| Maker submits its own approval | `HTTP 403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`, with a hint that the token is not allowed.                           |
| Checker submits                | The change was approved: no longer listed as pending, and the live `policy.json` was written to the policy directory. |
