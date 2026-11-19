# Key setup: the commands

This page lists every key command for the people who run the governance steps. Each person creates their own keys, on their own machine. The server stores only hashes and public keys. Raw keys and private keys never leave their owner's machine.

## 1. Set up the command, once per machine

Run these from the repository folder:

```bash
npm install
npx tsc -b
npm link -w @parmana/cli
parmana-ops --help
```

Do not run `npm install -g` from the repository folder. It installs the published package, which may not include these commands.

## 2. Who creates what

| Who      | Role                                    | Keys to create                                            |
| -------- | --------------------------------------- | --------------------------------------------------------- |
| You      | Maker (`pavancharak`)                   | One API key                                               |
| Mamta    | Checker (`mamta-checker`)               | One API key with a step-up key, and one approver key pair |
| Mohinder | Manager approver (`mohinder`)           | One approver key pair                                     |
| Operator | Kill-switch probe (`kill-switch-probe`) | One API key, limited to `kill-switch:probe`               |

## 3. The commands

**You (maker):**

```bash
parmana-ops keys generate-api-key --caller-id pavancharak --out-dir "$HOME/parmana-keys" --credential-holder-type USER
```

**Mamta (checker):**

```bash
parmana-ops keys generate-api-key --caller-id mamta-checker --out-dir "$HOME/parmana-keys" --credential-holder-type USER --generate-step-up-key
parmana-ops keys generate-approver-key --approver-id mamta-checker --key-id mamta-checker-key-1 --out-dir "$HOME/parmana-approver"
```

**Mohinder (manager approver):**

```bash
parmana-ops keys generate-approver-key --approver-id mohinder --key-id mohinder-key-1 --out-dir "$HOME/parmana-approver"
```

**Kill-switch probe (operator):**

```bash
parmana-ops keys generate-api-key --caller-id kill-switch-probe --out-dir "$HOME/parmana-keys" --allowed-capabilities kill-switch:probe
```

## 4. What to keep and what to send

- **Each API-key command** prints a `Key` value once, and a `PARMANA_API_KEYS` JSON entry. Save the `Key` value in a password manager. Send the JSON entry to the operator.
- **Each approver-key command** writes a private key file and a public key file. Keep the private key. Send the public key file to the operator.
- **Do not redirect the output to a file.** A file holding the raw key is a leak. Copy the output into the password manager directly.
- **Do not send raw keys or private keys** in a chat, an email or a repository.

## 5. If something is lost

A printed key cannot be recovered. Generate a new one with the same command, and tell the operator to remove the old entry.
