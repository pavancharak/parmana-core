# @parmana/cli

Command-line tool for Parmana policy governance. It covers the maker-checker steps used to change a policy: propose a change, sign a checker's step-up approval, submit it, and verify or export the signed approval log.

Full documentation: `docs/site/cli/` (start with `quickstart.mdx`). The command reference is generated: `npm run generate:cli-reference`.

## Install

With npm, on Node.js 24 or later:

```bash
npm install -g @parmana/cli
parmana --help
```

With the container image, which needs no Node.js:

```bash
docker pull ghcr.io/pavancharak/parmana-cli:2.0.1
docker run --rm ghcr.io/pavancharak/parmana-cli:2.0.1 --help
```

The image runs as a non-root user and has no token in it. Pass the token when you run it, and mount your working folder at `/work` to use local files such as a policy file:

```bash
docker run --rm -e PARMANA_TOKEN -e PARMANA_API_URL=https://parmana-api-real.vercel.app \
  -v "$PWD:/work" ghcr.io/pavancharak/parmana-cli:2.0.1 policy propose policy.json --name customer-refund --version 1.3.0 --reason "Tighten refund limit"
```

`-e PARMANA_TOKEN` with no value passes your shell's token into the container.

## Build from source

```bash
npm ci
npm run build --workspace=packages/cli
node packages/cli/dist/index.js --help
```

## Commands

Run `parmana <command> --help` for a command's options and an example.

| Command                                                        | Purpose                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `policy status <name> <version>`                               | Pending changes for one policy version                            |
| `policy propose <policy.json> --name --version --reason`       | Propose a change; the file must match the name and version        |
| `approval sign --key-file --key-id --pending --action [--out]` | Sign a step-up envelope on the checker's machine; nothing is sent |
| `approval submit --pending --action --envelope`                | Send a signed envelope with the checker's own token               |
| `log verify [--policy] [--base] [--require-coverage]`          | Check the approval log offline                                    |
| `log export [--policy]`                                        | Append approvals from the database to the log                     |
| `log check-db [--policy]`                                      | Compare the log with the database without writing                 |
| `completion <bash\|powershell>`                                | Print a shell completion script                                   |

## Global options

| Option                | Effect                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `--output text\|json` | Print results as text (default) or as JSON. Errors go to stdout as JSON too.      |
| `--profile <name>`    | Use a named API address from the config file.                                     |
| `--api-url <url>`     | Use this API address. Overrides `PARMANA_API_URL` and the profile.                |
| `--dry-run`           | Print the request without sending it. The token is masked and no token is needed. |
| `--verbose`           | Log each request and response code to stderr. Secrets are removed.                |
| `--timeout <seconds>` | Wait this long for each request (default 30).                                     |
| `--help`              | Show help for the command.                                                        |

## Environment

| Variable          | Used for                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `PARMANA_TOKEN`   | The bearer token. Read from the environment only; there is no flag for it. Not needed for `--dry-run`, `approval sign`, `log` or `completion`. |
| `PARMANA_API_URL` | The API address. Must be `https`, or a local `http` address.                                                                                   |
| `PARMANA_PROFILE` | The profile to use when `--profile` is not given.                                                                                              |
| `PARMANA_CONFIG`  | The config file path. Defaults to `~/.parmana/config.json`.                                                                                    |
| `CI_DATABASE_URL` | The read-only connection string for `log export` and `log check-db`.                                                                           |

API address precedence: `--api-url`, then `PARMANA_API_URL`, then the profile's `apiUrl`, then the production default.

## Config file

The config file holds only non-secret settings. Tokens are never stored in it.

```json
{
  "default": "prod",
  "profiles": {
    "prod": { "apiUrl": "https://parmana-api-real.vercel.app" },
    "local": { "apiUrl": "http://127.0.0.1:3000" }
  }
}
```

## Retries and safety

- A read (`policy status`) is retried up to three times on network errors and on 429, 502, 503 and 504, with a short backoff.
- A write is never retried. A repeated approval could reuse a spent envelope, and a repeated proposal would be refused as a conflict anyway.
- Every server refusal prints the code and the next step, for example `CHECKER_NOT_IN_SCOPE` and how to fix it.

## Exit codes

| Code | Meaning                                                                               |
| ---- | ------------------------------------------------------------------------------------- |
| 0    | Success                                                                               |
| 1    | The server, the network or a script reported a failure                                |
| 2    | Usage error, such as a missing flag, an unknown option, or a file that does not match |

## Example: approve a change

Run the signing step on the checker's machine. Nothing is sent by it:

```bash
parmana approval sign --key-file .\checker.step-up.private.pem --key-id <checker-key-id> --pending <pending-id> --action approve --out envelope.json
```

Preview the submission without sending it, then submit:

```bash
parmana approval submit --pending <pending-id> --action approve --envelope envelope.json --dry-run
parmana approval submit --pending <pending-id> --action approve --envelope envelope.json
```

The checker's `PARMANA_TOKEN` must be set for the `submit` step.

## Shell completion

PowerShell:

```powershell
parmana completion powershell | Out-String | Invoke-Expression
```

Bash:

```bash
eval "$(parmana completion bash)"
```
