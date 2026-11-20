# Tutorial: maker-checker approval of a policy change

[Tutorials](README.md) · [Policy management](../policies/README.md) · [CLI](../sdk/cli.md) · [API: policy changes](../api/endpoints.md#policy)

**Goal.** No change to a policy takes effect until a second, different person approves it. The **maker** proposes the change. The **checker** approves it with a step-up signature made with their own key. The server refuses the maker's approval of their own change, and refuses any approval that lacks a valid envelope.

**Verification.** Three runs, all against this repository:

- Tutorial 103 ([`examples/tutorials/103-policy-governance-maker-checker/run.ts`](../../../examples/tutorials/103-policy-governance-maker-checker/run.ts)) runs the four refusals and the approval over real HTTP. Its outputs: propose `201`; a service caller `403 NON_HUMAN_CALLER_DENIED`; the maker's approval `403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`; a checker without an envelope `403 STEP_UP_AUTHORIZATION_INVALID`; the checker with the envelope `200`, approved, with the policy file written.
- [`governed-flow.ts`](../examples/governed-quickstart/typescript/governed-flow.ts) and [`governed_flow.py`](../examples/governed-quickstart/python/governed_flow.py) run the same flow with the public SDKs against a local server.
- The `parmana-ops` CLI flow ran against a local server (see [CLI](../sdk/cli.md#the-maker-checker-flow-with-the-cli)).

## Who does what

| Party                            | Does                                                                                                                                                                                      | Holds                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Maker** (a person)             | Writes the new policy version and proposes it with a reason.                                                                                                                              | A caller key of type `USER`.                                                                                               |
| **Checker** (a different person) | Reviews the proposal and signs a step-up envelope on their own machine.                                                                                                                   | A caller key of type `USER`, and the step-up **private** key. The public half is registered on the checker's caller entry. |
| **Parmana service**              | Checks the caller is a human, the maker is not the checker, the checker is listed for this policy, and the envelope verifies. Then stores the approval record and writes the policy file. | The step-up **public** key (in `PARMANA_API_KEYS`), and `POLICY_CHANGE_CHECKERS`.                                          |
| **Your application**             | Nothing. Execution is refused until the version is approved.                                                                                                                              | Its own caller key, with no governance rights.                                                                             |

## Step 1: configure the people and the checker

The operator sets two things, in the server's environment:

```bash
# Who may approve a change to each policy. An empty list means nobody can, so approval is refused.
POLICY_CHANGE_CHECKERS='{"vendor-payment":["checker"]}'

# The callers. The checker's entry carries the public half of its step-up key.
PARMANA_API_KEYS='[
  {"callerId":"maker","keyHash":"<sha256 of the maker key>","credentialHolderType":"USER"},
  {"callerId":"checker","keyHash":"<sha256 of the checker key>","credentialHolderType":"USER",
   "stepUpPublicKey":"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n"}
]'
```

The `setup.mjs` script in [Getting started](../getting-started.md) writes exactly this configuration for the local run. The `parmana-ops keys generate-api-key --generate-step-up-key` command generates a key pair for a checker, and prints the entry to add (see [CLI](../sdk/cli.md)). The raw key is shown once. The server stores only its hash.

## Step 2: the maker proposes

The maker sends the whole policy document and a reason. The policy's `policyId` must equal the name in the URL, and its `policyVersion` must equal the version.

```typescript
import { readFileSync } from "node:fs";
import { ParmanaClient } from "@parmana/sdk";

const maker = new ParmanaClient({ endpoint, apiKey: process.env.MAKER_KEY });
const policy = JSON.parse(readFileSync("vendor-payment-2.1.1.json", "utf8"));

const proposal = await maker.proposePolicyChange("vendor-payment", "2.1.1", {
  proposedContent: policy,
  reason: "Lower the risk threshold from 20 to 15",
});
console.log(proposal.pendingPolicyChangeId, proposal.status); // PENDING_APPROVAL
```

The change is pending. Nothing is in effect yet. The server stores the proposal and the proposed content, and reports any validator warnings in the response.

## Step 3: the maker cannot approve it

The maker may not approve, or reject, their own change. The server refuses it:

```typescript
import { signPolicyChangeStepUp } from "@parmana/sdk";

// Even with a valid envelope, the same caller who proposed the change is refused.
try {
  await maker.approvePolicyChange(
    proposal.pendingPolicyChangeId,
    signPolicyChangeStepUp({
      pendingPolicyChangeId: proposal.pendingPolicyChangeId,
      action: "approve",
      privateKeyPem: stepUpPrivatePem,
      keyId: "checker-step-up-key",
    }),
  );
} catch (error) {
  // AuthorizationError (HTTP 403): ... proposed by this same caller — the proposer (maker) may not also approve or reject it (checker).
}
```

Verified: `403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`.

## Step 4: the checker reviews and approves

The checker reviews the proposed content (the operator can list pending changes with `GET /policies/pending-changes?status=…`, or `parmana-ops policy status <name> <version>`). If the checker agrees, they sign an envelope on their own machine and submit it with their own key:

```typescript
const checker = new ParmanaClient({
  endpoint,
  apiKey: process.env.CHECKER_KEY,
});

const approved = await checker.approvePolicyChange(
  proposal.pendingPolicyChangeId,
  signPolicyChangeStepUp({
    pendingPolicyChangeId: proposal.pendingPolicyChangeId,
    action: "approve",
    privateKeyPem: readFileSync("checker-stepup.private.pem", "utf8"), // stays with the checker
    keyId: "checker-step-up-key",
    ttlSeconds: 120, // default; signed just before submitting
  }),
);
console.log(approved.status); // APPROVED
```

The envelope is valid for 120 seconds. Sign it immediately before you submit it. The server checks each of these conditions: the caller is a human, the caller is listed for this policy, the envelope is signed by the checker's step-up key and is not expired, and the checker is not the maker. Tutorial 103 shows each one refusing a request that passes the others.

Verified: `200`, `APPROVED`, with the approval record stored and the `policy.json` written to the policy directory.

## Step 5: the version takes effect

Once approved, the version is the version in effect for its policy name, and the most recently approved version is the one executed. Earlier versions are superseded:

> `policy "vendor-payment"@"2.1.0" was superseded: the version in effect is "2.1.1", the one most recently approved.`

Verified: after `2.1.1` was approved through the CLI, a transaction naming `2.1.0` was refused with this message. See [Policy management](../policies/README.md#versions-and-the-version-in-effect).

## What the refusals mean

| Response                                   | Meaning                                                               | What to do                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `403 NON_HUMAN_CALLER_DENIED`              | A service caller tried to propose or approve.                         | Use a human's key, or do not make the change through this route.             |
| `403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE` | The maker tried to approve their own change.                          | Ask a different, listed checker.                                             |
| `403 STEP_UP_AUTHORIZATION_INVALID`        | No envelope, a bad signature, an expired envelope, or a wrong action. | Sign a fresh envelope with the checker's step-up key, and submit it at once. |

## The same flow in one command with the CLI

```bash
# The maker proposes from a file:
PARMANA_TOKEN="$MAKER_KEY" parmana-ops policy propose vendor-payment-2.1.1.json \
  --name vendor-payment --version 2.1.1 --reason "Lower the risk threshold"

# The checker signs locally, then submits with their own token:
parmana-ops approval sign --key-file checker-stepup.private.pem --key-id checker-step-up-key \
  --pending <id> --action approve --out envelope.json
PARMANA_TOKEN="$CHECKER_KEY" parmana-ops approval submit --pending <id> --action approve --envelope envelope.json
```

The published `parmana-ops` 4.1.1 prints nothing when run as an installed command; the repository's fix is not yet released. Use `node "$(npm root -g)/@parmana/cli/dist/index.js"` in its place. See [CLI](../sdk/cli.md#the-installed-binary-fixed-in-the-repository-not-yet-in-a-published-release).

## Production notes

- Keep the step-up private key on the checker's machine. Never put it in a repository, a CI secret, or a shared vault that the maker can read.
- A change to `POLICY_CHANGE_CHECKERS` is a configuration change. Make it through your normal change process.
- A checker who is not listed for a policy is refused. This check was not captured as a response in this verification; confirm it in your deployment.
