# Evaluating Parmana

This repository is source-available for evaluation only. Reading, building and running it to
assess Parmana is permitted. Any other use, including production deployment, redistribution or
derivative works, needs a separate written agreement with Parmana Systems. See
[LICENSE](./LICENSE).

This guide is the shortest path from a fresh clone to a working local system. It needs no
accounts, credentials, database or network access beyond `npm ci`.

## Requirements

- Node.js 24.6 or later. The hybrid Ed25519 and ML-DSA-65 signatures use `node:crypto`, which
  supports ML-DSA from 24.6.
- npm, as bundled with Node.js.
- Git, and Bash for two tests that syntax check shell scripts. On Windows, Git for Windows
  provides it.

Linux, macOS and Windows are supported. On Windows PowerShell 5.1, run each command on its own
line: it does not accept `&&` between commands.

## 1. Install, build and test

```bash
git clone https://github.com/pavancharak/parmana.git
cd parmana
npm ci
npm run build
npm test
```

`npm run build` comes before `npm test` because tests import the workspace packages from their
built `dist/` output; `npm test` refuses to run against stale output.

No `.env` is needed. The test setup uses the same local defaults as CI (the committed
`./policies`, in memory storage, local Ed25519 keys generated per run) unless you set them
yourself. Suites that need live services (HubSpot, Supabase) skip cleanly. Expect roughly
2,800 passing tests and about 50 skipped.

## 2. Run the examples

```bash
npm run examples
```

This runs every tutorial in [examples/tutorials/](examples/tutorials/) against local mock
connectors, with throwaway keys that are deleted afterwards. To see the whole chain in one
walkthrough (policy evaluation, signed authorization, envelope verification, credential
isolation, connector execution and the signed trust record):

```bash
npx tsx examples/tutorials/60-end-to-end-enterprise-execution/run.ts
```

## 3. Run the attack scenarios

```bash
npm run evaluate
```

This runs 16 attacks against the code and reports, for each, whether it was blocked. Each
scenario in [evaluations/scenarios.json](evaluations/scenarios.json) states what the attacker
controls, the attack, the invariant that must hold, the claims in
[docs/CLAIMS.md](docs/CLAIMS.md) it supports, and the test files that check it:

| ID    | Attack                                                   |
| ----- | -------------------------------------------------------- |
| EV-01 | Replay a used authorization                              |
| EV-02 | Forge or alter an authorization                          |
| EV-03 | Use an expired authorization or a revoked key            |
| EV-04 | Act without a person's signed approval                   |
| EV-05 | Forge or misuse an approval                              |
| EV-06 | Declare one action, execute another                      |
| EV-07 | Have an action judged by a weaker policy                 |
| EV-08 | Execute under an outdated policy version                 |
| EV-09 | Rely on facts that changed after approval                |
| EV-10 | Obtain a connector's credentials                         |
| EV-11 | Reach a connector without going through the gateway      |
| EV-12 | Act without credentials or outside a caller's scope      |
| EV-13 | Change a policy without a second person                  |
| EV-14 | Alter a signed record after the fact                     |
| EV-15 | Run the same transaction twice by racing                 |
| EV-16 | Read or write a policy file outside the policy directory |

To run only some scenarios, name them: `npm run evaluate -- EV-04 EV-05`.

A scenario is BLOCKED when every test in its files passes, FAILED when any fails, and NOT RUN
when a file is missing or ran nothing. The command exits non-zero unless all are BLOCKED, and
writes `evaluation-report.json` with the commit, whether the working tree was clean, the
Node.js version, a hash of the policies, and each test file's hash and counts.

EV-04 covers prompt injection by its effect, not by detecting it: whatever an injected agent
sends, an action that needs approval is not authorized without a signed approval from a trusted
person. These are tests of the code in this repository, run locally. They do not test a
deployment's configuration, its key custody or its network.

## 4. Try the hosted sandbox (optional)

A public sandbox runs the same API with demo policies. The scripts in
[examples/sandbox-playground/](examples/sandbox-playground/) call it from cURL, PowerShell,
TypeScript or Python. See
[Live API and demos](https://docs.parmanasystems.com/guides/live-api-and-demos) for
authentication and the request shape.

## 5. Verify a record offline

Every approved action produces a signed Execution Trust Record. It can be checked with only
the record and the public keys, without Parmana's runtime or database, using
[`@parmana/sign`](https://github.com/pavancharak/parmana-sign) or this repository's own
`packages/crypto/src/OfflineVerifier.ts`. See
[Verification SDK](https://docs.parmanasystems.com/sdks/parmana-sign/overview).

## Where to read next

- [Audit guide](https://docs.parmanasystems.com/evaluation/audit-guide): the system under
  evaluation, the points where execution is refused, what an attacker controls in each case
  (including a compromised signing key), and a bounded scenario pinned to a commit.
- [THREAT-MODEL.md](THREAT-MODEL.md): assets, trust boundaries, attackers, and each threat
  with its control, evidence and residual risk.
- [docs/CLAIMS.md](docs/CLAIMS.md): every technical claim, scoped to its evidence, with the
  code and tests that back it, and what is explicitly not claimed.
- [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md): what was found missing or wrong and
  how it was closed.
- [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md):
  packages and how a request flows through them.
- [The Parmana Handbook](https://docs.parmanasystems.com/handbook/overview): the codebase
  explained chapter by chapter.

## Licensing

The proprietary [LICENSE](./LICENSE) covers the server and everything else in this repository
except the SDKs. The SDKs are licensed under the Apache License 2.0: [typescript/](typescript/)
(`@parmana/sdk` on npm), [python/](python/) (`parmana` on PyPI),
[packages/connector-sdk/](packages/connector-sdk/) and
[python-connector-sdk/](python-connector-sdk/). `@parmana/sign` is a separate repository, also
under the Apache License 2.0.

## Break it

[SECURITY-CHALLENGE.md](SECURITY-CHALLENGE.md) lists what counts as breaking Parmana on a
copy you run yourself, what does not, and how to report a break privately.

## Questions and feedback

Email [founder@parmanasystems.com](mailto:founder@parmanasystems.com) for questions, a guided
walkthrough, or licensing. Report security issues privately as described in
[SECURITY.md](SECURITY.md).
